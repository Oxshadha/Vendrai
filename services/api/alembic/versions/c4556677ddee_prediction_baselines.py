"""Cache observed case durations so completion can be forecast.

Forecasting a case's completion means comparing it against how long comparable
cases actually took. Deriving that from the event log per request would mean
walking every historical case's events on every queue render, so the
distribution is pre-aggregated here and refreshed on a schedule.

One row per (tenant, case_type, status): small enough to load whole, which
keeps the per-case estimate to arithmetic at read time rather than a per-case
cache that would need invalidating on every transition.

`method` and `model_version_id` record which estimator produced the row, so a
tenant with enough history can be promoted to a fitted model without changing
the read path or the UI.

Revision ID: c4556677ddee
Revises: c3445566ccdd
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4556677ddee"
down_revision: str | None = "c3445566ccdd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "prediction_baselines",
        sa.Column("prediction_baseline_id", sa.Uuid(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.tenant_id"),
            nullable=False,
        ),
        sa.Column("case_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("p50_hours", sa.Float(), nullable=True),
        sa.Column("p90_hours", sa.Float(), nullable=True),
        sa.Column("sample_size", sa.Integer(), nullable=False, server_default="0"),
        # STATISTICAL | MODEL | INSUFFICIENT -- see domain/prediction.py
        sa.Column(
            "method",
            sa.String(length=20),
            nullable=False,
            server_default="INSUFFICIENT",
        ),
        sa.Column(
            "model_version_id",
            sa.Uuid(),
            sa.ForeignKey("model_versions.model_version_id"),
            nullable=True,
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "case_type",
            "status",
            name="uq_prediction_baselines_bucket",
        ),
    )
    op.create_index(
        "ix_prediction_baselines_tenant_id",
        "prediction_baselines",
        ["tenant_id"],
    )

    # Postgres-only: the test suite builds SQLite schemas from ORM metadata and
    # has no row-level security to configure.
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "prediction_baselines" ENABLE ROW LEVEL SECURITY')
        op.execute('ALTER TABLE "prediction_baselines" FORCE ROW LEVEL SECURITY')
        op.execute(
            """CREATE POLICY tenant_isolation_prediction_baselines
                ON "prediction_baselines"
                USING (
                  tenant_id = NULLIF(
                    current_setting('app.current_tenant_id', true), ''
                  )::uuid
                )
                WITH CHECK (
                  tenant_id = NULLIF(
                    current_setting('app.current_tenant_id', true), ''
                  )::uuid
                )"""
        )


def downgrade() -> None:
    op.drop_index(
        "ix_prediction_baselines_tenant_id",
        table_name="prediction_baselines",
    )
    op.drop_table("prediction_baselines")
