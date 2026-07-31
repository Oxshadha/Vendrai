"""Row locks must be FOR NO KEY UPDATE, not FOR UPDATE.

Inserting a child row (case_events, audit_logs, evidence_items ...) makes
Postgres take FOR KEY SHARE on the parent `cases` row for the foreign key
check. FOR UPDATE conflicts with that, so a transaction holding it while
waiting on the case-event advisory lock deadlocks against the transaction
holding that lock and inserting the event. That stalled the agent worker.

Nothing in this codebase mutates a primary key, so FOR NO KEY UPDATE keeps
every writer-vs-writer guarantee the version checks rely on. This test stops
the stronger mode being reintroduced by a well-meaning tightening.
"""

import pathlib
import re

APP = pathlib.Path(__file__).resolve().parents[1] / "app"

# `.with_for_update()` / `with_for_update=True` -- the bare forms that mean
# FOR UPDATE. The keyword form `with_for_update(key_share=True)` is the fix.
BARE_LOCK = re.compile(r"\.with_for_update\(\s*\)|with_for_update\s*=\s*True")


def test_no_plain_for_update_locks_remain():
    offenders = []
    for path in sorted(APP.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if BARE_LOCK.search(line):
                offenders.append(f"{path.relative_to(APP)}:{number}")
    assert not offenders, (
        "use with_for_update(key_share=True) -- plain FOR UPDATE deadlocks "
        f"against foreign key checks: {offenders}"
    )


def test_key_share_compiles_to_for_no_key_update():
    """Guards the assumption the fix rests on."""
    from sqlalchemy import select
    from sqlalchemy.dialects import postgresql

    from app.models import Case

    compiled = str(
        select(Case.case_id).with_for_update(key_share=True)
        .compile(dialect=postgresql.dialect())
    )
    assert "FOR NO KEY UPDATE" in compiled
