/**
 * Human-readable summaries for workflow events.
 *
 * The timeline used to render each event's raw payload as a JSON block, which
 * made a normal case read like a debug console: five near-identical objects of
 * UUIDs where a person only wanted to know which document moved and when. The
 * payload is still available behind a toggle, because for an auditable trail
 * "trust the summary" is not good enough -- but it is no longer the default.
 */

export interface CaseEventLike {
  event_type: string;
  payload: Record<string, unknown>;
}

function text(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Last segment of a UUID -- enough to correlate, short enough to read. */
function shortId(value: string | undefined): string | undefined {
  return value ? value.split("-").at(-1)?.slice(-8) : undefined;
}

/**
 * A short sentence describing what happened, or `null` when the event type has
 * no better phrasing than its own name.
 */
export function describeCaseEvent(event: CaseEventLike): string | null {
  const p = event.payload ?? {};
  const file = text(p, "filename");
  const doc = shortId(text(p, "document_id"));
  const named = file ?? (doc ? `document ${doc}` : "a document");
  const status = text(p, "status");
  const pages = typeof p.pages === "number" ? p.pages : undefined;

  switch (event.event_type) {
    case "CASE_CREATED":
      return "Case opened as a draft.";
    case "CASE_SUBMITTED":
      return "Submitted for analysis. Agent processing starts here.";
    case "CASE_CLAIMED":
      return "Claimed by a reviewer.";
    case "CASE_RELEASED":
      return "Ownership released back to the queue.";
    case "CASE_CANCELLED":
      return "Case cancelled.";
    case "DOCUMENT_UPLOAD_INITIATED":
      return `Upload started for ${named}.`;
    case "DOCUMENT_PROCESSING_QUEUED":
      return `${named} queued for malware scan and extraction.`;
    case "DOCUMENT_READY":
      return pages === undefined
        ? `${named} scanned clean and extracted.`
        : `${named} scanned clean and extracted (${pages} page${pages === 1 ? "" : "s"}).`;
    case "DOCUMENT_MALWARE_DETECTED":
      return `${named} was rejected by the malware scan and never reached extraction.`;
    case "DOCUMENT_FIELD_CORRECTED":
      return `A reviewer corrected an extracted field on ${named}.`;
    case "DRAFT_DOCUMENTS_READY":
      return "All draft documents are processed.";
    case "RUN_WAITING_FOR_DOCUMENTS":
      return "Waiting for every document to finish scanning before analysis begins.";
    case "SPECIALIST_ANALYSIS_STARTED":
      return "Specialist agents started running concurrently.";
    case "ANALYSIS_COMPLETED":
      return "Agent analysis finished.";
    case "AGENT_BLOCKED":
      return "The agent stopped and handed the case to a human.";
    case "VERIFICATION_FAILED":
      return "Evidence verification failed, so the case is held.";
    case "CLARIFICATION_REQUESTED":
      return "A question was raised that needs a human answer.";
    case "CLARIFICATION_ANSWERED":
      return "The clarification was answered; the case can continue.";
    case "APPROVAL_REQUIRED":
      return "Ready for a human decision.";
    case "APPROVAL_DECIDED":
      return status ? `Decision recorded: ${status.toLowerCase()}.` : "A decision was recorded.";
    case "ERP_SYNC_QUEUED":
      return "Queued for ERP synchronization.";
    case "ERP_SYNC_RETRY_QUEUED":
      return "ERP synchronization failed and was queued for retry.";
    case "ERP_PROVIDER_CONFIRMED":
      return "The ERP confirmed the record. The case is complete.";
    case "RISK_FINDING_DISPOSITIONED":
      return "A risk finding was reviewed and dispositioned.";
    default:
      return null;
  }
}

/** Title-cased event name, used as the heading above the summary. */
export function eventTitle(eventType: string): string {
  return eventType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}
