"""Database glue for completion forecasting.

Mirrors the split in ``services/analytics.py``: this module only reads rows and
writes baselines, while every estimator lives in ``domain/prediction.py`` where
it can be tested without a database.

Both a worker and an endpoint need to refresh baselines, so the work lives in
``refresh_baselines`` and neither owns it -- the same split
``services/alerts.evaluate_alerts_for_tenant`` uses.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, datetime

from app.domain.prediction import (
    Baseline,
    DurationSample,
    Forecast,
    choose_estimator,
    forecast_case,
    summarize_durations,
)
from app.models import Case, CaseEvent, PredictionBaseline
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

#: Reaching one of these means the case is finished, so the elapsed time up to
#: it is a completed observation. Mirrors the terminal detection in
#: ``services/analytics.metric_records``.
TERMINAL_EVENTS = frozenset({"ERP_PROVIDER_CONFIRMED"})


def utc(value: datetime | None) -> datetime | None:
    """Normalize to aware UTC; SQLite hands back naive datetimes."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def duration_samples(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
) -> list[DurationSample]:
    """Observed durations for every completed case, bucketed by its path.

    A case contributes one sample per status it passed through: the hours from
    submission to completion, attributed to that status. So a case that sat in
    RISK_REVIEW teaches the RISK_REVIEW bucket how long cases that reach that
    state actually take end to end -- which is the question the queue asks.
    """
    cases = (
        (
            await db.execute(
                select(Case).where(
                    Case.tenant_id == tenant_id,
                    Case.submitted_at.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not cases:
        return []

    case_ids = [case.case_id for case in cases]
    events = (
        (
            await db.execute(
                select(CaseEvent).where(
                    CaseEvent.tenant_id == tenant_id,
                    CaseEvent.case_id.in_(case_ids),
                )
            )
        )
        .scalars()
        .all()
    )

    events_by_case: dict[uuid.UUID, list[CaseEvent]] = defaultdict(list)
    for event in events:
        events_by_case[event.case_id].append(event)

    samples: list[DurationSample] = []
    for case in cases:
        submitted = utc(case.submitted_at)
        if submitted is None:
            continue

        case_events = events_by_case[case.case_id]
        terminal_times = [
            utc(event.created_at)
            for event in case_events
            if event.event_type in TERMINAL_EVENTS
        ]
        terminal_at = min(
            (value for value in terminal_times if value is not None),
            default=utc(case.resolved_at),
        )
        if terminal_at is None:
            continue  # still open: it has no duration to teach us yet

        hours = (terminal_at - submitted).total_seconds() / 3600
        if hours < 0:
            continue

        # Every status the case was observed in, from the status stamped onto
        # each event payload by `append_case_event`.
        statuses = {
            str(event.payload.get("case_status"))
            for event in case_events
            if isinstance(event.payload, dict) and event.payload.get("case_status")
        }
        statuses.add(case.status)
        for status in statuses:
            samples.append(
                DurationSample(case_type=case.case_type, status=status, hours=hours)
            )
    return samples


async def refresh_baselines(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
) -> list[PredictionBaseline]:
    """Recompute and persist every duration baseline for one tenant.

    Upserts in place rather than delete-then-insert so a concurrent read never
    observes a tenant with no baselines at all.
    """
    samples = await duration_samples(db, tenant_id=tenant_id)
    baselines = summarize_durations(samples)

    existing = {
        (row.case_type, row.status): row
        for row in (
            (
                await db.execute(
                    select(PredictionBaseline).where(
                        PredictionBaseline.tenant_id == tenant_id
                    )
                )
            )
            .scalars()
            .all()
        )
    }

    now = datetime.now(UTC)
    written: list[PredictionBaseline] = []
    for baseline in baselines:
        row = existing.get((baseline.case_type, baseline.status))
        if row is None:
            row = PredictionBaseline(
                tenant_id=tenant_id,
                case_type=baseline.case_type,
                status=baseline.status,
            )
            db.add(row)
        row.p50_hours = baseline.p50_hours
        row.p90_hours = baseline.p90_hours
        row.sample_size = baseline.sample_size
        row.method = choose_estimator(baseline.sample_size)
        row.computed_at = now
        written.append(row)
    return written


async def load_baselines(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
) -> dict[tuple[str, str], Baseline]:
    """Every baseline for a tenant, keyed for O(1) lookup per queue row."""
    rows = (
        (
            await db.execute(
                select(PredictionBaseline).where(
                    PredictionBaseline.tenant_id == tenant_id
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        (row.case_type, row.status): Baseline(
            case_type=row.case_type,
            status=row.status,
            p50_hours=row.p50_hours,
            p90_hours=row.p90_hours,
            sample_size=row.sample_size,
        )
        for row in rows
    }


def forecast_for(
    *,
    case_type: str,
    status: str,
    submitted_at: datetime | None,
    baselines: dict[tuple[str, str], Baseline],
    now: datetime | None = None,
) -> Forecast:
    """Forecast one case against pre-loaded baselines."""
    return forecast_case(
        submitted_at=utc(submitted_at),
        now=now or datetime.now(UTC),
        baseline=baselines.get((case_type, status)),
    )
