/**
 * Guided tour catalog.
 *
 * Tour scripts live here rather than on the components they point at. The
 * registry only knows about *currently mounted* elements, so a tour defined
 * from mounted DOM can never leave the page it started on -- which is why the
 * dashboard tour used to report "step 1 of 1". Declaring steps centrally lets a
 * step name a target that has not rendered yet, so the engine can navigate to
 * its route and wait for it to appear.
 *
 * Components still call `useAssistanceTarget` to supply the anchor element and
 * the copilot's context payload; only the narrative and ordering live here.
 */

export interface TourStep {
  /** Must match a `useAssistanceTarget` id. */
  targetId: string;
  /** Navigate here first when the user is not already on it. */
  route?: string;
  title: string;
  /** What this item is *for* -- the point of the tour. */
  body: string;
  /** Step is skipped when the user holds none of these roles. */
  roles?: string[];
  /** Skip silently when the target never mounts (data-dependent panels). */
  optional?: boolean;
}

export interface TourDefinition {
  id: string;
  label: string;
  summary: string;
  steps: TourStep[];
}

const APPROVER_ROLES = [
  "analyst",
  "approver",
  "procurement_approver",
  "compliance_approver",
  "finance_approver",
  "auditor",
  "admin",
];
const ANALYST_ROLES = ["analyst", "auditor", "admin"];
const AUDITOR_ROLES = ["auditor", "admin"];
const ADMIN_ROLES = ["admin"];

export const WELCOME_TOUR_ID = "welcome";

export const TOURS: TourDefinition[] = [
  {
    id: WELCOME_TOUR_ID,
    label: "Welcome to Vendrai",
    summary: "A full walkthrough of the product, from where work arrives to how it is approved and reported.",
    steps: [
      {
        targetId: "nav.primary",
        route: "/",
        title: "Your way around",
        body: "Every area of Vendrai hangs off this bar. What you see here depends on your role, so colleagues will not all have the same tabs.",
      },
      {
        targetId: "nav.notifications",
        route: "/",
        title: "How work reaches you",
        body: "Vendrai never emails you to act. SLA breaches, clarification requests and approval hand-offs all surface here instead.",
      },
      {
        targetId: "nav.account",
        route: "/",
        title: "Your account and role",
        body: "Your role decides what you can approve and which pages you can open. Re-run this tour or sign out from here.",
      },
      {
        targetId: "dashboard.metrics",
        route: "/",
        title: "Today's load at a glance",
        body: "Active work, decisions waiting on a human, and cases that are blocked. The small deltas compare this week against last.",
      },
      {
        targetId: "dashboard.volume",
        route: "/",
        title: "Is throughput holding up?",
        body: "Fourteen days of case volume, split into resolved same-day versus still in flight. A growing pale band means work is accumulating.",
      },
      {
        targetId: "dashboard.assistant",
        route: "/",
        title: "Ask rather than hunt",
        body: "The assistant explains statuses, evidence and next steps. It can guide and point, but it can never approve or progress work on your behalf.",
      },
      {
        targetId: "supplier.secure-intake",
        route: "/cases/new",
        title: "How supplier work starts",
        body: "Uploads land in quarantine and are malware-scanned before anything reads them. Extraction and agent analysis only run on cleared files.",
      },
      {
        targetId: "supplier.recent-cases",
        route: "/cases/new",
        title: "Supplier work already in flight",
        body: "Onboarding cases only, filtered to this workflow. Filter by status, priority and ownership; your view is remembered per workflow.",
      },
      {
        targetId: "invoice.secure-intake",
        route: "/invoices/new",
        title: "How invoice exceptions start",
        body: "Invoices are matched three ways against purchase orders and goods receipts. Anything outside tolerance becomes an exception for review.",
      },
      {
        targetId: "invoice.recent-cases",
        route: "/invoices/new",
        title: "Exceptions already in flight",
        body: "Invoice exceptions only, kept separate from supplier onboarding so each workflow has its own queue and saved view.",
      },
      {
        targetId: "approvals.queue",
        route: "/approvals",
        title: "The human control point",
        body: "Automation prepares the evidence; a person makes the call. Decisions are version-checked, so a stale or replayed approval is rejected.",
        roles: APPROVER_ROLES,
      },
      {
        targetId: "analytics.metrics",
        route: "/analytics",
        title: "Metrics you can defend",
        body: "Every figure is derived from immutable workflow events rather than model output, so the numbers reconcile against the audit trail.",
        roles: ANALYST_ROLES,
      },
      {
        targetId: "analytics.risk",
        route: "/analytics",
        title: "Active controls versus shadow scores",
        body: "Controls marked ACTIVE can hold work. Models in SHADOW mode can only recommend a review -- they never block a case on their own.",
        roles: ANALYST_ROLES,
        optional: true,
      },
      {
        targetId: "reports.exports",
        route: "/reports",
        title: "What leaves the system",
        body: "Exports carry only the case summary fields you are already authorised to see here. Bank details, tax IDs and raw documents never leave.",
        roles: AUDITOR_ROLES,
      },
      {
        targetId: "admin.integrations",
        route: "/admin",
        title: "Is the platform healthy?",
        body: "Credential-free readiness for every integration, with retry guidance. Cases fail closed when sanctions lists are stale rather than passing unchecked.",
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    id: "dashboard.orientation",
    label: "Dashboard orientation",
    summary: "The headline metrics, the volume chart and the docked assistant.",
    steps: [
      {
        targetId: "dashboard.metrics",
        route: "/",
        title: "Today's load at a glance",
        body: "Active work, decisions waiting on a human, and cases that are blocked, each with a week-on-week delta.",
      },
      {
        targetId: "dashboard.volume",
        route: "/",
        title: "Throughput over two weeks",
        body: "Resolved same-day versus still in flight. The highlighted column is the busiest day in the window.",
      },
      {
        targetId: "dashboard.assistant",
        route: "/",
        title: "The assistant",
        body: "Ask what a status means or which cases carry risk. It explains and guides, but cannot progress work.",
      },
    ],
  },
  {
    id: "supplier.intake-tour",
    label: "Start supplier onboarding",
    summary: "How a supplier case is raised and what happens to the documents.",
    steps: [
      {
        targetId: "supplier.secure-intake",
        route: "/cases/new",
        title: "Secure intake",
        body: "Name the supplier, set priority, attach evidence. Files are quarantined and scanned before extraction or any agent reads them.",
      },
      {
        targetId: "supplier.recent-cases",
        route: "/cases/new",
        title: "Previous supplier cases",
        body: "Onboarding work already raised, filtered to this workflow, with its own saved view.",
      },
    ],
  },
  {
    id: "invoice.intake-tour",
    label: "Process an invoice exception",
    summary: "How an invoice is submitted for three-way matching.",
    steps: [
      {
        targetId: "invoice.secure-intake",
        route: "/invoices/new",
        title: "Invoice intake",
        body: "Attach the invoice with its purchase order and receipt. Line items are extracted and matched, and tolerance breaches become exceptions.",
      },
      {
        targetId: "invoice.recent-cases",
        route: "/invoices/new",
        title: "Previous invoice exceptions",
        body: "Exception work already raised, kept separate from supplier onboarding.",
      },
    ],
  },
  {
    id: "case.review-tour",
    label: "Review a case",
    summary: "Reading the agent trace, the evidence and making the decision. Open a case first.",
    steps: [
      {
        targetId: "case.agent-map",
        title: "What the agent did",
        body: "The execution path, step by step, with real timings. Projected steps are dashed until they actually run.",
      },
      {
        targetId: "case.clarification",
        title: "Open questions",
        body: "Where the workflow needs a human answer before it can continue. Responding here releases the case.",
        optional: true,
      },
      {
        targetId: "case.document-review",
        title: "Source versus extraction",
        body: "The authorised document beside the masked fields pulled from it, with confidence and page location. Corrections are versioned.",
        optional: true,
      },
      {
        targetId: "case.events",
        title: "The durable trail",
        body: "Replayable workflow events with public reason codes. Private chain-of-thought is deliberately never exposed here.",
      },
      {
        targetId: "case.evidence",
        title: "Why this outcome",
        body: "The claims, sources and deterministic reason codes behind the proposed action, so a decision can be justified later.",
        optional: true,
      },
      {
        targetId: "case.decision-control",
        title: "Your decision",
        body: "Approve or reject against the case version and evidence hash shown. A stale version is rejected rather than silently applied.",
        optional: true,
      },
    ],
  },
];

export function getTour(id: string): TourDefinition | undefined {
  return TOURS.find((tour) => tour.id === id);
}

/** Steps the given roles are allowed to see, preserving catalog order. */
export function stepsForRoles(tour: TourDefinition, roles: ReadonlySet<string>): TourStep[] {
  return tour.steps.filter((step) => !step.roles || step.roles.some((role) => roles.has(role)));
}

/** Tours worth offering: those with at least one step this user can reach. */
export function toursForRoles(roles: ReadonlySet<string>): TourDefinition[] {
  return TOURS.filter((tour) => stepsForRoles(tour, roles).length > 0);
}
