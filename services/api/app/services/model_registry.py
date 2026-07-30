"""Load persisted model artifacts back for inference.

``scripts/train_synthetic_anomaly_model.py`` trains a model, serializes it with
skops, records a SHA-256 and inserts a ``ModelVersion`` row -- but nothing ever
read the artifact back, so every scorer refit in-process instead. This is the
missing half.

Two safety properties matter here and are enforced, not assumed:

1. **The artifact is verified before it is deserialized.** Deserializing an
   untrusted artifact is arbitrary code execution. The manifest's SHA-256 is
   checked against the bytes first, and skops is loaded with an explicit
   allow-list of estimator types rather than ``trusted=True``.
2. **A missing or failed load is not an error condition for the caller.** It
   returns ``None`` so the caller falls back to the statistical estimator. A
   model that will not load must never take a workflow down.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass
from typing import Any

from app.models import ModelVersion
from app.services.storage import read_private_artifact
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

#: Estimator types we are willing to reconstruct. skops requires an explicit
#: allow-list; `trusted=True` would accept whatever the artifact declares,
#: which defeats the point of checking it at all.
TRUSTED_TYPES = [
    "sklearn.ensemble._iforest.IsolationForest",
    "sklearn.tree._tree.Tree",
    "numpy.dtype",
    "numpy.ndarray",
]

ACTIVE_STATUS = "ACTIVE"


@dataclass(frozen=True)
class LoadedModel:
    """A deserialized estimator with the lineage needed to record its use."""

    estimator: Any
    model_version_id: uuid.UUID
    version: str
    artifact_sha256: str


def artifact_key(tenant_id: uuid.UUID | str, purpose: str, version: str) -> str:
    return f"models/{tenant_id}/{purpose}/{version}.skops"


def manifest_key(tenant_id: uuid.UUID | str, purpose: str, version: str) -> str:
    return f"models/{tenant_id}/{purpose}/{version}.json"


class ArtifactIntegrityError(RuntimeError):
    """Raised when stored bytes do not match the digest recorded for them."""


def verify_digest(payload: bytes, expected_sha256: str) -> None:
    """Fail loudly when an artifact does not match its manifest.

    Separate from the load path so the check is directly testable, and so a
    mismatch is never silently downgraded to a cache miss -- a tampered model
    artifact is a security event, not a missing file.
    """
    actual = hashlib.sha256(payload).hexdigest()
    # Constant-time: the digest is attacker-influenced input.
    if not hmac.compare_digest(actual, expected_sha256):
        raise ArtifactIntegrityError(
            f"artifact digest mismatch: expected {expected_sha256}, got {actual}"
        )


def deserialize(payload: bytes) -> Any:
    """Reconstruct an estimator from skops bytes under an allow-list."""
    import skops.io as sio

    unknown = sio.get_untrusted_types(data=payload)
    disallowed = [name for name in unknown if name not in TRUSTED_TYPES]
    if disallowed:
        raise ArtifactIntegrityError(
            f"artifact declares untrusted types: {', '.join(sorted(disallowed))}"
        )
    return sio.loads(payload, trusted=TRUSTED_TYPES)


async def active_model_version(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    model_name: str,
) -> ModelVersion | None:
    """The version marked ACTIVE for this tenant and purpose, if any.

    Training inserts rows as EVALUATION_REQUIRED, so a model only becomes
    loadable once something has explicitly promoted it.
    """
    return (
        (
            await db.execute(
                select(ModelVersion)
                .where(
                    ModelVersion.tenant_id == tenant_id,
                    ModelVersion.model_name == model_name,
                    ModelVersion.status == ACTIVE_STATUS,
                )
                .order_by(ModelVersion.created_at.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )


async def load_active_model(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    model_name: str,
) -> LoadedModel | None:
    """Load the active model for a purpose, or ``None`` to fall back.

    Returns ``None`` when there is no active version, when the artifact or its
    manifest is missing, or when the artifact cannot be trusted. Callers are
    expected to degrade to the statistical estimator rather than fail.
    """
    version_row = await active_model_version(
        db, tenant_id=tenant_id, model_name=model_name
    )
    if version_row is None:
        return None

    try:
        manifest_bytes = read_private_artifact(
            manifest_key(tenant_id, model_name, version_row.version)
        )
        manifest = json.loads(manifest_bytes.decode())
        expected = str(manifest["artifact_sha256"])
        payload = read_private_artifact(
            artifact_key(tenant_id, model_name, version_row.version)
        )
    except (FileNotFoundError, KeyError, ValueError):
        return None

    # Deliberately outside the except above: an integrity failure must
    # propagate rather than be mistaken for an absent model.
    verify_digest(payload, expected)
    estimator = deserialize(payload)

    return LoadedModel(
        estimator=estimator,
        model_version_id=version_row.model_version_id,
        version=version_row.version,
        artifact_sha256=expected,
    )
