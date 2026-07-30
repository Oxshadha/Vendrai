"""Periodically recompute case-duration baselines.

Shaped like ``workers/alerts.py``: no broker binding, one transaction per
tenant, business logic left in ``services/predictions`` so an endpoint can
trigger the same refresh on demand.

Forecasts are read on every queue render, so the aggregation deliberately does
not happen there. Baselines move slowly enough that an hourly refresh is
indistinguishable from a live computation, and it keeps a full walk of the
event log off the request path.
"""

import asyncio
import uuid

from app.config import settings
from app.services.predictions import refresh_baselines
from app.workers.database import WorkerSession, set_worker_tenant


def configured_tenant_ids() -> list[uuid.UUID]:
    configured = [
        item.strip()
        for item in settings.ALERT_TENANT_IDS.split(",")
        if item.strip()
    ]
    if not configured and settings.APP_ENV != "production":
        configured = [settings.DEV_TENANT_ID]
    return [uuid.UUID(item) for item in configured]


async def refresh_once() -> None:
    for tenant_id in configured_tenant_ids():
        async with WorkerSession() as session:
            async with session.begin():
                await set_worker_tenant(session, str(tenant_id))
                await refresh_baselines(session, tenant_id=tenant_id)


async def run() -> None:
    if settings.APP_ENV == "production" and not configured_tenant_ids():
        raise RuntimeError("ALERT_TENANT_IDS_REQUIRED")
    while True:
        await refresh_once()
        await asyncio.sleep(settings.PREDICTION_REFRESH_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(run())
