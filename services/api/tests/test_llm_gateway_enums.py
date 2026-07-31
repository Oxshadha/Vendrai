"""The payload guard must not reject the agent's own control-plane enums.

A SWIFT/BIC code is indistinguishable from any eight-character uppercase
token by regex alone, so `failure_policy="BLOCKING"` read as a bank
identifier and every investigation plan was rejected before it reached the
provider. These tests pin both halves: the exemption works, and the guard is
still armed for real values.
"""

import typing

from app.agents import contracts, planning, workflow
from pydantic import BaseModel
from app.domain.pii import sensitive_entity_types
from app.llm_gateway import SYSTEM_ENUM_VALUES, validate_minimized_payload

import pytest


def _literal_values(annotation) -> set[str]:
    """Every string constant reachable from a Literal annotation."""
    found: set[str] = set()
    if typing.get_origin(annotation) is typing.Literal:
        found.update(a for a in typing.get_args(annotation) if isinstance(a, str))
    for argument in typing.get_args(annotation):
        found |= _literal_values(argument)
    return found


def _declared_enum_values() -> set[str]:
    """Literal values on the models that are actually serialized to the LLM.

    Scoped to models *declared in* these modules, plus the standalone aliases.
    A bare `dir()` sweep also picks up re-exported `app.config` settings
    (`development`, `s3`, `keycloak`), which never enter a payload and would
    make this assertion meaningless noise.
    """
    values: set[str] = set()
    for alias in (planning.WorkflowKind, contracts.ToolStatus, workflow.HumanGateKind):
        values |= _literal_values(alias)
    for module in (planning, contracts, workflow):
        for name in dir(module):
            attribute = getattr(module, name)
            if not isinstance(attribute, type) or not issubclass(attribute, BaseModel):
                continue
            if attribute.__module__ != module.__name__:
                continue
            for field in attribute.model_fields.values():
                values |= _literal_values(field.annotation)
    return values


def test_exemption_covers_every_declared_enum_value():
    """Drift guard: a new Literal must be added to SYSTEM_ENUM_VALUES.

    Without this, adding an eight-character enum silently reintroduces the
    outage -- the failure surfaces only as agents crashing in production.
    """
    missing = _declared_enum_values() - set(SYSTEM_ENUM_VALUES)
    assert not missing, f"add these to SYSTEM_ENUM_VALUES: {sorted(missing)}"


def test_regression_the_exact_payload_that_was_rejected():
    """The capability shape from agents/planning.py must now validate."""
    validate_minimized_payload({
        "_data_classification": "SYNTHETIC",
        "eligible_capabilities": [
            {"capability_id": "sanctions_screening", "failure_policy": "BLOCKING"},
            {"capability_id": "duplicate_check", "failure_policy": "OPTIONAL"},
            {"capability_id": "policy_lookup", "failure_policy": "RETRYABLE"},
        ],
    })


@pytest.mark.parametrize("value", ["BLOCKING", "OPTIONAL", "APPROVED", "REJECTED", "APPROVAL"])
def test_enums_would_otherwise_be_flagged(value):
    """Proves the exemption is load-bearing, not decorative."""
    assert "SWIFT_CODE" in sensitive_entity_types(value)


def test_guard_still_rejects_a_real_swift_code():
    """The exemption must not become a hole: only exact constants pass."""
    with pytest.raises(ValueError, match="LLM_PAYLOAD_REJECTED"):
        validate_minimized_payload({
            "_data_classification": "SYNTHETIC",
            "vendor": {"bank": "DEUTDEFF500"},
        })


def test_guard_still_rejects_enum_lookalikes_in_free_text():
    """A constant embedded in prose is data again, and stays scanned."""
    with pytest.raises(ValueError, match="LLM_PAYLOAD_REJECTED"):
        validate_minimized_payload({
            "_data_classification": "SYNTHETIC",
            "note": "remit to BLOCKING per the vendor",
        })
