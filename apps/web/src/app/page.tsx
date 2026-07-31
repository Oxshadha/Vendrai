"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Gauge,
  Hourglass,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  UserRoundX,
} from "lucide-react";
import { useGetWorkQueueApiV1WorkQueueGet } from "@/generated/neurox";
import type { WorkQueueItem } from "@/generated/models";
import { api, type MetricKey, type MetricValue, type VendorCase } from "@/lib/api";
import { useAuth } from "@/app/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DotMatrixChart } from "@/components/ui/dot-matrix-chart";
import { KpiTile, type KpiDirection } from "@/components/ui/kpi-tile";
import { MaterialIcon } from "@/components/ui/material-icon";
import { useAssistanceTarget } from "@/components/assistance-registry";

const terminal = new Set(["COMPLETED", "REJECTED", "FAILED", "CANCELLED"]);
const successStatuses = new Set(["COMPLETED", "APPROVED", "AUTO_RESOLVED"]);
const blockedStatuses = ["NEEDS_CLARIFICATION", "RISK_REVIEW", "DUPLICATE_REVIEW", "VERIFICATION_FAILED", "ERP_SYNC_FAILED"];
/** Cases older than this without reaching a terminal state are called out. */
const AGEING_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Roles the API will serve `/analytics/summary` and `/risk-findings` to. A
 * requester holds none of them, so those queries are never fired for one --
 * a dashboard that shows a row of failed panels to its most common visitor is
 * worse than one that shows a smaller, complete picture.
 */
const ANALYTICS_ROLES = [
  "analyst",
  "approver",
  "procurement_approver",
  "compliance_approver",
  "finance_approver",
  "auditor",
  "admin",
];

/** How each governed metric should be read when it moves. */
const METRIC_DIRECTION: Record<MetricKey, KpiDirection> = {
  invoice_stp_rate: "up-good",
  invoice_cycle_hours: "up-bad",
  vendor_onboarding_cycle_hours: "up-bad",
  vendor_activation_rate: "up-good",
  invoice_exception_rate: "up-bad",
  pending_approval_count: "up-bad",
};

const METRIC_ICONS: Record<MetricKey, typeof Gauge> = {
  invoice_stp_rate: Gauge,
  invoice_cycle_hours: Clock3,
  vendor_onboarding_cycle_hours: Repeat2,
  vendor_activation_rate: CheckCircle2,
  invoice_exception_rate: ShieldAlert,
  pending_approval_count: ShieldCheck,
};

const AGING_BUCKETS: Array<{ key: string; label: string; fill: string }> = [
  // Sequential, one hue, light to dark as the wait grows. Age is a magnitude,
  // not a status, so it does not borrow the reserved warning/critical colours.
  { key: "lt_24h", label: "Under 24h", fill: "bg-blue-200" },
  { key: "24_48h", label: "24–48h", fill: "bg-blue-400" },
  { key: "2_7d", label: "2–7 days", fill: "bg-blue-600" },
  { key: "gt_7d", label: "Over 7 days", fill: "bg-blue-800" },
];

/** Bucket cases by created_at day, for the trailing `days` days ending today. */
function bucketByDay(cases: VendorCase[], days: number) {
  const buckets = new Map<string, { a: number; b: number }>();
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    buckets.set(date.toISOString().slice(0, 10), { a: 0, b: 0 });
  }
  for (const item of cases) {
    const day = item.created_at.slice(0, 10);
    const bucket = buckets.get(day);
    if (!bucket) continue;
    if (successStatuses.has(item.status)) bucket.a += 1;
    else bucket.b += 1;
  }
  return [...buckets.entries()].map(([day, counts]) => ({
    label: new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    ...counts,
  }));
}

/** Cases that reached a successful terminal state within the last `days`. */
function resolvedSince(cases: VendorCase[], days: number) {
  const cutoff = Date.now() - days * DAY_MS;
  return cases.filter(
    (item) => successStatuses.has(item.status) && new Date(item.updated_at).getTime() >= cutoff,
  ).length;
}

/** Cases created in the last `days` days, vs. the `days` before that. */
function periodDelta(cases: VendorCase[], predicate: (item: VendorCase) => boolean, days = 7) {
  const now = Date.now();
  let recent = 0;
  let prior = 0;
  for (const item of cases) {
    if (!predicate(item)) continue;
    const age = now - new Date(item.created_at).getTime();
    if (age <= days * DAY_MS) recent += 1;
    else if (age <= days * 2 * DAY_MS) prior += 1;
  }
  return recent - prior;
}

function metricDisplay(metric: MetricValue): string {
  if (metric.value === null) return "—";
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "hours") return `${metric.value.toFixed(1)}h`;
  return metric.value.toFixed(0);
}

/** Movement against the previous period, rounded to one place, or undefined. */
function metricDelta(metric: MetricValue): number | undefined {
  if (metric.value === null || metric.previous_value === null) return undefined;
  return Number((metric.value - metric.previous_value).toFixed(1));
}

function metricSuffix(metric: MetricValue): string {
  return metric.unit === "percent" ? "%" : metric.unit === "hours" ? "h" : "";
}

function formatHours(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Dashboard() {
  const { roles } = useAuth();
  const canReadAnalytics = ANALYTICS_ROLES.some((role) => roles.has(role));
  const metricsAssistance = useAssistanceTarget<HTMLElement>({
    id: "dashboard.metrics",
    title: "Case metrics",
    description: "Active work, decisions awaiting a human, blocked cases and unclaimed cases, each with a week-on-week delta.",
  });
  const serviceAssistance = useAssistanceTarget<HTMLElement>({
    id: "dashboard.service-levels",
    title: "Service levels",
    description: "How long work is waiting: the oldest open case, how much has aged past 48 hours, the urgent load and what has been resolved this week.",
  });
  const performanceAssistance = useAssistanceTarget<HTMLElement>({
    id: "dashboard.performance",
    title: "Governed outcome metrics",
    description: "Straight-through processing, cycle times, activation and exception rates, all derived from immutable workflow events rather than model output.",
  });
  const volumeAssistance = useAssistanceTarget({
    id: "dashboard.volume",
    title: "Case volume",
    description: "Fourteen days of throughput split into resolved same-day versus still in flight.",
  });
  const backlogAssistance = useAssistanceTarget({
    id: "dashboard.backlog",
    title: "Approval backlog and risk",
    description: "How long the approvals waiting on a person have been waiting, and how many risk findings are still open.",
  });

  // The queue itself now lives beside each intake form, split by case type.
  // This query stays because the metrics below are counted from it -- and it is
  // deliberately unfiltered now, so the headline numbers describe all work
  // rather than whatever view someone last left the queue in.
  const cases = useGetWorkQueueApiV1WorkQueueGet({ ownership: "ALL" });
  const allCases = useQuery({ queryKey: ["cases"], queryFn: api.listCases });
  const summary = useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: api.getAnalyticsSummary,
    enabled: canReadAnalytics,
  });
  const findings = useQuery({
    queryKey: ["risk-findings"],
    queryFn: api.listRiskFindings,
    enabled: canReadAnalytics,
  });

  const queue = useMemo(() => cases.data?.items ?? [], [cases.data]);
  const open = useMemo(
    () => queue.filter((item: WorkQueueItem) => !terminal.has(item.status)),
    [queue],
  );
  const pending = open.length;
  const approvals = queue.filter((item: WorkQueueItem) => item.status === "APPROVAL_PENDING").length;
  const blocked = queue.filter((item: WorkQueueItem) => blockedStatuses.includes(item.status)).length;
  const unassigned = open.filter((item: WorkQueueItem) => !item.assigned_user_id).length;
  const urgent = open.filter((item: WorkQueueItem) => item.priority === "URGENT" || item.priority === "HIGH").length;
  const oldestHours = open.reduce(
    (worst: number, item: WorkQueueItem) => Math.max(worst, item.age_seconds / 3600),
    0,
  );
  const ageing = open.filter((item: WorkQueueItem) => item.age_seconds / 3600 >= AGEING_HOURS).length;

  const rows = useMemo(() => allCases.data?.items ?? [], [allCases.data]);
  const resolvedThisWeek = resolvedSince(rows, 7);
  const chartData = useMemo(() => bucketByDay(rows, 14), [rows]);
  const highlightIndex = useMemo(() => {
    if (chartData.length === 0) return undefined;
    let bestIndex = 0;
    let bestTotal = -1;
    chartData.forEach((point, index) => {
      const total = point.a + point.b;
      if (total > bestTotal) {
        bestTotal = total;
        bestIndex = index;
      }
    });
    return bestTotal > 0 ? bestIndex : undefined;
  }, [chartData]);
  const insight = useMemo(() => {
    if (highlightIndex === undefined) return null;
    const peak = chartData[highlightIndex];
    const total = peak.a + peak.b;
    const pct = total > 0 ? Math.round((peak.a / total) * 100) : 0;
    return `${peak.label} had the highest volume with ${total} case${total === 1 ? "" : "s"}, ${pct}% resolved same-day.`;
  }, [chartData, highlightIndex]);

  const activeDelta = periodDelta(rows, (item) => !terminal.has(item.status));
  const approvalDelta = periodDelta(rows, (item) => item.status === "APPROVAL_PENDING");
  const blockedDelta = periodDelta(rows, (item) => blockedStatuses.includes(item.status));
  const unassignedDelta = periodDelta(
    rows,
    (item) => !terminal.has(item.status) && !item.assigned_user_id,
  );

  const aging = summary.data?.approval_aging ?? {};
  const agingTotal = AGING_BUCKETS.reduce((total, bucket) => total + (aging[bucket.key] ?? 0), 0);
  const openFindings = (findings.data ?? []).filter(
    (finding) => finding.status !== "RESOLVED" && finding.status !== "CLOSED",
  );
  const activeControls = openFindings.filter((finding) => finding.mode === "ACTIVE").length;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-12">
      <header className="mb-8 flex flex-col justify-between gap-4 lg:mb-10 xl:flex-row xl:items-center">
        <div>
          <p className="mb-1 text-sm font-bold text-[var(--color-accent)]">Supplier onboarding control room</p>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Operational overview</h1>
          <p className="mt-2 text-[var(--color-muted)]">Live case state from the durable workflow—no simulated agent trace.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/cases/new" className="w-full sm:w-auto">
            <Button variant="primary" className="w-full sm:w-auto">New supplier</Button>
          </Link>
        </div>
      </header>

      {cases.isError && <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">Unable to load the work queue. Check your role and integration health.</div>}

      <section {...metricsAssistance} className="mb-6 sm:mb-8" aria-labelledby="dashboard-load">
        <h2 id="dashboard-load" className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Work in flight
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
          <KpiTile
            label="Active cases"
            value={String(pending)}
            icon={Clock3}
            detail="Across all processing states"
            delta={activeDelta}
            deltaCaption=" vs last week"
          />
          <KpiTile
            label="Awaiting approval"
            value={String(approvals)}
            icon={ShieldCheck}
            detail="Evidence-bound human decisions"
            delta={approvalDelta}
            deltaCaption=" vs last week"
            direction="up-bad"
          />
          <KpiTile
            label="Needs attention"
            value={String(blocked)}
            icon={FileText}
            detail="Blocked without stopping other services"
            delta={blockedDelta}
            deltaCaption=" vs last week"
            direction="up-bad"
          />
          <KpiTile
            label="Unclaimed"
            value={String(unassigned)}
            icon={UserRoundX}
            detail="Open work with nobody named on it"
            delta={unassignedDelta}
            deltaCaption=" vs last week"
            direction="up-bad"
          />
        </div>
      </section>

      <section {...serviceAssistance} className="mb-6 sm:mb-8" aria-labelledby="dashboard-service">
        <h2 id="dashboard-service" className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Service levels
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
          <KpiTile
            label="Oldest open case"
            value={pending === 0 ? "—" : formatHours(oldestHours)}
            icon={Hourglass}
            detail="Longest anything has been waiting"
          />
          <KpiTile
            label={`Ageing past ${AGEING_HOURS}h`}
            value={String(ageing)}
            icon={AlarmClock}
            detail="Open cases at risk of breaching"
          />
          <KpiTile
            label="Urgent and high"
            value={String(urgent)}
            icon={Flame}
            detail="Open work raised above normal priority"
          />
          <KpiTile
            label="Resolved this week"
            value={String(resolvedThisWeek)}
            icon={CheckCircle2}
            detail="Approved, completed or auto-resolved"
          />
        </div>
      </section>

      {canReadAnalytics && (summary.data || summary.isLoading) && (
        <section {...performanceAssistance} className="mb-6 sm:mb-8" aria-labelledby="dashboard-performance">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="dashboard-performance" className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted)]">
              Governed outcome metrics
            </h2>
            <Link href="/analytics" className="text-xs font-bold text-[var(--color-accent)]">
              Full analytics
            </Link>
          </div>
          {summary.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3" aria-live="polite">
              {[0, 1, 2, 3, 4, 5].map((placeholder) => (
                <Card key={placeholder}>
                  <div className="h-20 animate-pulse rounded-xl bg-[var(--color-surface-muted)]" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
              {(summary.data?.metrics ?? []).map((metric) => (
                <KpiTile
                  key={metric.key}
                  label={metric.label}
                  value={metricDisplay(metric)}
                  icon={METRIC_ICONS[metric.key]}
                  delta={metricDelta(metric)}
                  deltaSuffix={metricSuffix(metric)}
                  deltaCaption=" vs prior period"
                  direction={METRIC_DIRECTION[metric.key]}
                  detail={
                    metric.denominator !== null
                      ? `${metric.numerator ?? 0} of ${metric.denominator}`
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card {...volumeAssistance}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Case volume</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Last 14 days, resolved same-day vs still in flight.</p>
            </div>
          </div>
          {insight && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--color-accent-light)] p-3 text-sm text-[var(--color-accent-dark)]">
              <MaterialIcon name="auto_awesome" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{insight}</p>
            </div>
          )}
          <div className="mt-6">
            <DotMatrixChart
              data={chartData}
              seriesALabel="Resolved same-day"
              seriesBLabel="Still in flight"
              highlightIndex={highlightIndex}
              ariaLabel="Case volume over the last 14 days"
            />
          </div>
        </Card>

        {canReadAnalytics && (
          <Card {...backlogAssistance} className="flex flex-col">
            <h2 className="font-display text-lg font-bold">Approval backlog</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              How long the {agingTotal} decision{agingTotal === 1 ? "" : "s"} waiting on a person have been waiting.
            </p>
            <ul className="mt-5 space-y-3">
              {AGING_BUCKETS.map((bucket) => {
                const count = aging[bucket.key] ?? 0;
                const share = agingTotal === 0 ? 0 : (count / agingTotal) * 100;
                return (
                  <li key={bucket.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-[var(--color-muted)]">{bucket.label}</span>
                      <span className="font-bold tabular-nums text-[var(--color-ink)]">{count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                      <div
                        className={`h-full rounded-full ${bucket.fill}`}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {agingTotal === 0 && !summary.isLoading && (
              <p className="mt-4 text-sm text-[var(--color-muted)]">
                Nothing is waiting on a human decision right now.
              </p>
            )}

            <div className="mt-auto border-t border-[var(--color-border)] pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--color-muted)]">Open risk findings</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {activeControls} on an active control that can hold work; the rest are shadow scores.
                  </p>
                </div>
                <p className="font-display text-3xl font-extrabold text-[var(--color-ink)]">
                  {findings.isLoading ? "—" : openFindings.length}
                </p>
              </div>
              <Link
                href="/analytics"
                className="mt-3 inline-block text-xs font-bold text-[var(--color-accent)]"
              >
                Review findings
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
