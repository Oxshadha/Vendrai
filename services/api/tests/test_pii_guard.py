import pytest
from app.domain.pii import mask_sensitive_text, sensitive_entity_types
from app.llm_gateway import _classify_provider_error, validate_minimized_payload
from app.schemas import ApprovalDecisionRequest, FieldCorrectionRequest


class _InvalidKeyProviderError(Exception):
    code = 400
    status = "INVALID_ARGUMENT"
    message = "API key not valid. Please pass a valid API key."


@pytest.mark.parametrize(
    ("raw", "entity"),
    [
        ("contact invoices@example.test", "EMAIL_ADDRESS"),
        ("SWIFT ABCDLKLX", "SWIFT_CODE"),
        ("TIN: 123456789V", "TAX_ID"),
        ("Account Number: 001234567890", "BANK_ACCOUNT"),
        ("Registration No: PV123456", "COMPANY_REGISTRATION"),
        ("Call +94 77 123 4567", "PHONE_NUMBER"),
    ],
)
def test_custom_procurement_recognizers_mask_adversarial_values(
    raw,
    entity,
):
    assert entity in sensitive_entity_types(raw)
    masked = mask_sensitive_text(raw)
    assert raw != masked
    assert f"<{entity}>" in masked


def test_value_level_pii_guard_rejects_unmasked_value_under_safe_key():
    with pytest.raises(ValueError, match="LLM_PAYLOAD_REJECTED"):
        validate_minimized_payload(
            {
                "_data_classification": "SYNTHETIC",
                "notes": "Send to invoices@example.test",
            }
        )


def test_invalid_google_key_is_classified_as_auth_failure(monkeypatch):
    from app import llm_gateway

    monkeypatch.setattr(
        llm_gateway.errors,
        "APIError",
        _InvalidKeyProviderError,
    )
    classified = _classify_provider_error(_InvalidKeyProviderError())
    assert classified.error_code == "LLM_AUTH_INVALID"
    assert classified.retryable is False


def test_human_narratives_are_masked_and_payload_edits_rejected():
    decision = ApprovalDecisionRequest(
        decision="REJECTED",
        expected_version=2,
        evidence_hash="a" * 64,
        comment="Bank account 001234567890 must be corrected",
    )
    assert "001234567890" not in decision.comment
    correction = FieldCorrectionRequest(
        value="001234567890",
        expected_version=2,
        reason="Account Number: 001234567890 was mistyped",
    )
    assert correction.value == "001234567890"
    assert "001234567890" not in correction.reason
    with pytest.raises(ValueError, match="reanalysis"):
        ApprovalDecisionRequest(
            decision="APPROVED",
            expected_version=2,
            evidence_hash="a" * 64,
            edited_payload={"bank_account": "001234567890"},
        )


# --- Detector precision -------------------------------------------------
#
# The patterns were matching the agent's own output: any eight-letter
# uppercase word looked like a BIC, any ISO date looked like a phone number,
# and the TAX_ID/BANK_ACCOUNT captures accepted plain English, so a claim
# merely *naming* a field was treated as carrying its value. Every
# investigation payload was rejected and cases stalled mid-analysis.
#
# These two tests are a pair and must stay that way: the first proves the
# guard still catches real values, the second proves it no longer fires on
# text that contains none. Loosening a detector is only safe with both.

import pytest

from app.domain.pii import sensitive_entity_types


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("DEUTDEFF500", "SWIFT_CODE"),
        ("SWIFT: DEUTDEFF", "SWIFT_CODE"),
        ("BIC CODE CHASUS33", "SWIFT_CODE"),
        ("Tax ID: GB123456789", "TAX_ID"),
        ("VAT 987654321", "TAX_ID"),
        ("Account number 12345678901", "BANK_ACCOUNT"),
        ("A/C 4455667788", "BANK_ACCOUNT"),
        ("+44 20 7946 0958", "PHONE_NUMBER"),
        ("GB29NWBK60161331926819", "IBAN"),
        ("a.person@example.com", "EMAIL_ADDRESS"),
    ],
)
def test_real_sensitive_values_are_still_detected(value, expected):
    assert expected in sensitive_entity_types(value)


@pytest.mark.parametrize(
    "value",
    [
        "COMPLETE",            # eight-letter word, not a BIC
        "VERIFIED",
        "SCREENED",
        "BLOCKING",            # capability failure_policy
        "OPTIONAL",
        "APPROVED",            # approval decision
        "2026-06-01",          # ISO date, not a phone number
        "PROC-001 clause 3.1 effective 2026-06-01",
        "Tax ID verified against the national registry",
        "Account number matches the supplier master record",
        "Bank account confirmed by two documents",
    ],
)
def test_text_carrying_no_sensitive_value_is_not_flagged(value):
    assert sensitive_entity_types(value) == []
