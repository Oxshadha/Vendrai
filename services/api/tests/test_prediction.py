"""Completion forecasting: pure estimators plus the baseline pipeline."""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.domain.prediction import (
    INSUFFICIENT,
    MIN_SAMPLES,
    MODEL,
    STATISTICAL,
    Baseline,
    DurationSample,
    breach_risk,
    choose_estimator,
    forecast_case,
    project_backlog,
    summarize_durations,
)
from app.models import Case, CaseEvent, Tenant, User
from app.services.model_registry import ArtifactIntegrityError, verify_digest
from app.services.predictions import refresh_baselines

TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")


def _seed_tenant(session) -> None:
    """Cases require a requester, so a tenant is never enough on its own."""
    session.add(Tenant(tenant_id=TENANT_ID, name="Acme", slug="acme"))
    session.add(
        User(
            user_id=USER_ID,
            tenant_id=TENANT_ID,
            external_subject="requester",
            email="requester@example.test",
            full_name="Req Uester",
            roles=["requester"],
        )
    )


# --------------------------------------------------------------------------
# Pure estimators
# --------------------------------------------------------------------------


def test_summarize_durations_buckets_by_type_and_status() -> None:
    samples = [
        DurationSample("VENDOR_ONBOARDING", "COMPLETED", 10.0),
        DurationSample("VENDOR_ONBOARDING", "COMPLETED", 20.0),
        DurationSample("INVOICE_EXCEPTION", "COMPLETED", 5.0),
    ]
    baselines = {(b.case_type, b.status): b for b in summarize_durations(samples)}

    assert baselines[("VENDOR_ONBOARDING", "COMPLETED")].sample_size == 2
    assert baselines[("VENDOR_ONBOARDING", "COMPLETED")].p50_hours == 15.0
    assert baselines[("INVOICE_EXCEPTION", "COMPLETED")].sample_size == 1


def test_summarize_durations_discards_negative_durations() -> None:
    """Clock skew must not drag a baseline below zero."""
    samples = [
        DurationSample("VENDOR_ONBOARDING", "COMPLETED", -4.0),
        DurationSample("VENDOR_ONBOARDING", "COMPLETED", 8.0),
    ]
    (baseline,) = summarize_durations(samples)
    assert baseline.sample_size == 1
    assert baseline.p50_hours == 8.0


def test_choose_estimator_thresholds() -> None:
    assert choose_estimator(0) == INSUFFICIENT
    assert choose_estimator(MIN_SAMPLES - 1) == INSUFFICIENT
    assert choose_estimator(MIN_SAMPLES) == STATISTICAL
    assert choose_estimator(1000) == MODEL


def test_breach_risk_tracks_the_observed_spread() -> None:
    baseline = Baseline("VENDOR_ONBOARDING", "OPEN", 10.0, 20.0, 50)

    assert breach_risk(0.0, baseline) == 0.0
    assert breach_risk(5.0, baseline) == 0.25   # halfway to p50
    assert breach_risk(10.0, baseline) == 0.5   # at p50
    assert breach_risk(15.0, baseline) == 0.7   # halfway p50 -> p90
    assert breach_risk(20.0, baseline) == 1.0   # at p90
    assert breach_risk(999.0, baseline) == 1.0  # saturates, never exceeds 1


def test_breach_risk_needs_enough_history() -> None:
    thin = Baseline("VENDOR_ONBOARDING", "OPEN", 10.0, 20.0, MIN_SAMPLES - 1)
    assert breach_risk(5.0, thin) is None


def test_forecast_reports_insufficient_rather_than_guessing() -> None:
    """A thin bucket must say so, not invent a confident-looking ETA."""
    now = datetime(2026, 1, 2, tzinfo=UTC)
    forecast = forecast_case(
        submitted_at=now - timedelta(hours=3),
        now=now,
        baseline=Baseline("VENDOR_ONBOARDING", "OPEN", 10.0, 20.0, 2),
    )
    assert forecast.method == INSUFFICIENT
    assert forecast.known is False
    assert forecast.eta_p50 is None
    assert forecast.breach_risk is None


def test_forecast_projects_from_submission() -> None:
    submitted = datetime(2026, 1, 1, tzinfo=UTC)
    forecast = forecast_case(
        submitted_at=submitted,
        now=submitted + timedelta(hours=5),
        baseline=Baseline("VENDOR_ONBOARDING", "OPEN", 10.0, 20.0, 40),
    )
    assert forecast.eta_p50 == submitted + timedelta(hours=10)
    assert forecast.eta_p90 == submitted + timedelta(hours=20)
    assert forecast.method == STATISTICAL
    assert forecast.breach_risk == 0.25


def test_forecast_without_submission_is_unknown() -> None:
    forecast = forecast_case(
        submitted_at=None,
        now=datetime(2026, 1, 1, tzinfo=UTC),
        baseline=Baseline("VENDOR_ONBOARDING", "OPEN", 10.0, 20.0, 40),
    )
    assert forecast.method == INSUFFICIENT


def test_project_backlog_floors_at_zero() -> None:
    """A queue cannot go negative however fast it is cleared."""
    assert project_backlog(
        open_now=10, inflow_per_day=1, resolved_per_day=5, horizon_days=4
    ) == [6.0, 2.0, 0.0, 0.0]


def test_project_backlog_grows_when_inflow_exceeds_capacity() -> None:
    assert project_backlog(
        open_now=0, inflow_per_day=5, resolved_per_day=2, horizon_days=3
    ) == [3.0, 6.0, 9.0]


# --------------------------------------------------------------------------
# Artifact integrity
# --------------------------------------------------------------------------


def test_verify_digest_accepts_matching_bytes() -> None:
    payload = b"model-bytes"
    verify_digest(payload, hashlib.sha256(payload).hexdigest())


def test_verify_digest_rejects_a_tampered_artifact() -> None:
    """Deserializing an unverified artifact is arbitrary code execution."""
    original = b"model-bytes"
    digest = hashlib.sha256(original).hexdigest()
    with pytest.raises(ArtifactIntegrityError):
        verify_digest(b"model-bytes-tampered", digest)


# --------------------------------------------------------------------------
# Baseline pipeline
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_baselines_derives_percentiles_from_events() -> None:
    from app.database import AsyncSessionLocal

    submitted = datetime(2026, 1, 1, tzinfo=UTC)
    durations = [4, 6, 8, 10, 12]  # hours; MIN_SAMPLES of them

    async with AsyncSessionLocal() as session:
        async with session.begin():
            _seed_tenant(session)
            for index, hours in enumerate(durations):
                case_id = uuid.uuid4()
                session.add(
                    Case(
                        case_id=case_id,
                        tenant_id=TENANT_ID,
                        case_number=f"VND-{index:04d}",
                        requester_user_id=USER_ID,
                        case_type="VENDOR_ONBOARDING",
                        status="COMPLETED",
                        title="Onboard",
                        submitted_at=submitted,
                        resolved_at=submitted + timedelta(hours=hours),
                    )
                )
                session.add(
                    CaseEvent(
                        tenant_id=TENANT_ID,
                        case_id=case_id,
                        sequence=1,
                        event_type="ERP_PROVIDER_CONFIRMED",
                        actor_type="SYSTEM",
                        payload={"case_status": "COMPLETED"},
                        created_at=submitted + timedelta(hours=hours),
                    )
                )

    async with AsyncSessionLocal() as session:
        async with session.begin():
            written = await refresh_baselines(session, tenant_id=TENANT_ID)

    baseline = next(
        row for row in written if row.status == "COMPLETED"
    )
    assert baseline.sample_size == len(durations)
    assert baseline.p50_hours == 8.0  # median of 4,6,8,10,12
    assert baseline.method == STATISTICAL


@pytest.mark.asyncio
async def test_refresh_baselines_ignores_open_cases() -> None:
    """An unfinished case has no duration to teach, and must not count."""
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        async with session.begin():
            _seed_tenant(session)
            session.add(
                Case(
                    case_id=uuid.uuid4(),
                    requester_user_id=USER_ID,
                    tenant_id=TENANT_ID,
                    case_number="VND-OPEN",
                    case_type="VENDOR_ONBOARDING",
                    status="RISK_REVIEW",
                    title="Still going",
                    submitted_at=datetime(2026, 1, 1, tzinfo=UTC),
                )
            )

    async with AsyncSessionLocal() as session:
        async with session.begin():
            written = await refresh_baselines(session, tenant_id=TENANT_ID)

    assert written == []
