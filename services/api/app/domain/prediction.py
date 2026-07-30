"""Completion-time estimation from recorded case history.

Pure functions only: no database, no I/O, so every estimator here is testable
against hand-built samples.

The estimator is deliberately statistical rather than a fitted model. The event
log is the only training signal available, and a fresh tenant has none of it --
`domain.fraud.isolation_forest_scores` already refuses to fit under 1000 rows.
Percentiles degrade gracefully instead: they say "not enough history" at n=2 and
sharpen as cases accumulate. `choose_estimator` marks the point where a tenant
has enough history to justify a fitted model, so the swap is one function rather
than a rewrite of the callers.

Nothing here may block a case. Estimates are advisory and are surfaced as such.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.analytics import percentile

#: Below this, percentiles are noise and the UI is told to say so rather than
#: render a confident-looking number derived from two data points.
MIN_SAMPLES = 5

#: Above this, a tenant has enough history that a fitted model can beat
#: percentiles. Matches the floor `isolation_forest_scores` enforces.
MODEL_SAMPLE_THRESHOLD = 1000

STATISTICAL = "STATISTICAL"
MODEL = "MODEL"
INSUFFICIENT = "INSUFFICIENT"


@dataclass(frozen=True)
class DurationSample:
    """One observed case duration, bucketed by the path it took."""

    case_type: str
    status: str
    hours: float


@dataclass(frozen=True)
class Baseline:
    """Historical duration distribution for one (case_type, status) bucket."""

    case_type: str
    status: str
    p50_hours: float | None
    p90_hours: float | None
    sample_size: int

    @property
    def usable(self) -> bool:
        return self.sample_size >= MIN_SAMPLES and self.p50_hours is not None


@dataclass(frozen=True)
class Forecast:
    """An advisory completion estimate for a single open case."""

    eta_p50: datetime | None
    eta_p90: datetime | None
    #: 0..1 position of elapsed time within the historical distribution.
    breach_risk: float | None
    method: str
    sample_size: int

    @property
    def known(self) -> bool:
        return self.method != INSUFFICIENT


def choose_estimator(sample_size: int) -> str:
    """Which estimator this bucket's history can support."""
    if sample_size >= MODEL_SAMPLE_THRESHOLD:
        return MODEL
    if sample_size >= MIN_SAMPLES:
        return STATISTICAL
    return INSUFFICIENT


def summarize_durations(samples: list[DurationSample]) -> list[Baseline]:
    """Collapse observed durations into one baseline per (case_type, status)."""
    buckets: dict[tuple[str, str], list[float]] = {}
    for sample in samples:
        if sample.hours < 0:
            continue
        buckets.setdefault((sample.case_type, sample.status), []).append(sample.hours)

    baselines: list[Baseline] = []
    for (case_type, status), hours in sorted(buckets.items()):
        baselines.append(
            Baseline(
                case_type=case_type,
                status=status,
                p50_hours=percentile(hours, 0.5),
                p90_hours=percentile(hours, 0.9),
                sample_size=len(hours),
            )
        )
    return baselines


def breach_risk(elapsed: float, baseline: Baseline) -> float | None:
    """How far through its expected life this case already is, clamped to 0..1.

    Interpolates between p50 and p90 so the number tracks the observed spread
    rather than a fixed deadline: at p50 it reads 0.5, at p90 it reads 0.9, and
    anything past p90 saturates at 1.0.
    """
    if not baseline.usable or baseline.p50_hours is None:
        return None
    p50 = baseline.p50_hours
    p90 = baseline.p90_hours if baseline.p90_hours is not None else p50

    if elapsed <= 0:
        return 0.0
    if p50 <= 0:
        return 1.0
    if elapsed < p50:
        return round(0.5 * (elapsed / p50), 4)
    if p90 <= p50:
        return 1.0
    if elapsed >= p90:
        return 1.0
    return round(0.5 + 0.4 * ((elapsed - p50) / (p90 - p50)), 4)


def forecast_case(
    *,
    submitted_at: datetime | None,
    now: datetime,
    baseline: Baseline | None,
) -> Forecast:
    """Project completion for one open case against its bucket's history."""
    if baseline is None or not baseline.usable or submitted_at is None:
        return Forecast(
            eta_p50=None,
            eta_p90=None,
            breach_risk=None,
            method=INSUFFICIENT,
            sample_size=baseline.sample_size if baseline else 0,
        )

    assert baseline.p50_hours is not None  # guaranteed by `usable`
    elapsed = max(0.0, (now - submitted_at).total_seconds() / 3600)
    p90 = baseline.p90_hours if baseline.p90_hours is not None else baseline.p50_hours

    return Forecast(
        eta_p50=submitted_at + timedelta(hours=baseline.p50_hours),
        eta_p90=submitted_at + timedelta(hours=p90),
        breach_risk=breach_risk(elapsed, baseline),
        method=choose_estimator(baseline.sample_size),
        sample_size=baseline.sample_size,
    )


def project_backlog(
    *,
    open_now: int,
    inflow_per_day: float,
    resolved_per_day: float,
    horizon_days: int,
) -> list[float]:
    """Projected open-case count for each of the next `horizon_days` days.

    A deliberately transparent net-flow model: users can check it against the
    two rates shown beside it. Floored at zero, since a queue cannot go
    negative however fast the team clears it.
    """
    projected: list[float] = []
    level = float(max(0, open_now))
    for _ in range(max(0, horizon_days)):
        level = max(0.0, level + inflow_per_day - resolved_per_day)
        projected.append(round(level, 2))
    return projected
