"""Re-drive agent runs stranded by the LLM_PAYLOAD_REJECTED crash loop.

The payload guard rejected every investigation plan (see llm_gateway
SYSTEM_ENUM_VALUES), so these runs were created, crashed on each retry, and
were finally dead-lettered. They will not reprocess on their own.

This enqueues a fresh analysis request through the normal outbox, so the work
runs through the real pipeline exactly as a new submission would -- no state
is fabricated and no result is copied in. A new idempotency key is required
because the original one is already recorded, which is precisely what stops
the queue redelivering it.

Safe to re-run: it only selects runs still QUEUED whose case has no evidence.

    docker compose exec api python scripts/redrive_stalled_analysis.py [--apply]
"""

import asyncio
import sys
import uuid

from sqlalchemy import func, select

from app.database import AsyncSessionLocal, set_tenant_context
from app.models import AgentRun, Case, EvidenceItem
from app.services.events import enqueue_event

TENANT_ID = "00000000-0000-0000-0000-000000000001"
ANALYSIS_STATUS = "SPECIALIST_ANALYSIS"


async def main(apply: bool) -> int:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            await set_tenant_context(session, TENANT_ID)
            evidence_count = (
                select(func.count(EvidenceItem.evidence_item_id))
                .where(EvidenceItem.case_id == Case.case_id)
                .scalar_subquery()
            )
            rows = (
                await session.execute(
                    select(Case, AgentRun)
                    .join(AgentRun, AgentRun.case_id == Case.case_id)
                    .where(
                        Case.status == ANALYSIS_STATUS,
                        AgentRun.status == "QUEUED",
                        evidence_count == 0,
                    )
                    .order_by(Case.created_at)
                )
            ).all()

            if not rows:
                print("nothing stranded -- no runs to re-drive")
                return 0

            print(f"{len(rows)} stranded run(s):")
            for case, run in rows:
                print(f"  {case.case_number}  run={run.run_id}  v{case.current_version}")

            if not apply:
                print("\ndry run -- pass --apply to enqueue")
                return 0

            for case, run in rows:
                enqueue_event(
                    session,
                    tenant_id=uuid.UUID(TENANT_ID),
                    aggregate_type="case",
                    aggregate_id=case.case_id,
                    aggregate_version=case.current_version,
                    event_type="agent.analysis.requested.v1",
                    idempotency_key=f"redrive:{run.run_id}:{uuid.uuid4()}",
                    payload={"case_id": str(case.case_id), "run_id": str(run.run_id)},
                )
            print(f"\nenqueued {len(rows)} analysis request(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--apply" in sys.argv)))
