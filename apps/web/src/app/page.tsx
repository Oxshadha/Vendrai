"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock3, FileText, ShieldCheck } from "lucide-react";
import { useGetWorkQueueApiV1WorkQueueGet } from "@/generated/neurox";
import { api, type VendorCase } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DotMatrixChart } from "@/components/ui/dot-matrix-chart";
import { MaterialIcon } from "@/components/ui/material-icon";
import { useAssistanceTarget } from "@/components/assistance-registry";

const terminal = new Set(["COMPLETED", "REJECTED", "FAILED", "CANCELLED"]);
const successStatuses = new Set(["COMPLETED", "APPROVED", "AUTO_RESOLVED"]);

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

/** Cases created in the last `days` days, vs. the `days` before that. */
function periodDelta(cases: VendorCase[], predicate: (item: VendorCase) => boolean, days = 7) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let recent = 0;
  let prior = 0;
  for (const item of cases) {
    if (!predicate(item)) continue;
    const age = now - new Date(item.created_at).getTime();
    if (age <= days * dayMs) recent += 1;
    else if (age <= days * 2 * dayMs) prior += 1;
  }
  return recent - prior;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  return (
    <Badge tone={delta > 0 ? "positive" : "negative"}>
      {delta > 0 ? "+" : ""}
      {delta}
    </Badge>
  );
}

export default function Dashboard() {
  const metricsAssistance = useAssistanceTarget<HTMLElement>({
    id: "dashboard.metrics",
    title: "Case metrics",
    description: "Active work, decisions awaiting a human, and blocked cases, each with a week-on-week delta.",
  });
  const volumeAssistance = useAssistanceTarget({
    id: "dashboard.volume",
    title: "Case volume",
    description: "Fourteen days of throughput split into resolved same-day versus still in flight.",
  });
  // The queue itself now lives beside each intake form, split by case type.
  // This query stays because the metrics below are counted from it -- and it is
  // deliberately unfiltered now, so the headline numbers describe all work
  // rather than whatever view someone last left the queue in.
  const cases = useGetWorkQueueApiV1WorkQueueGet({ ownership: "ALL" });
  const allCases = useQuery({ queryKey: ["cases"], queryFn: api.listCases });

  const queue = useMemo(() => cases.data?.items ?? [], [cases.data]);
  const pending = queue.filter((item) => !terminal.has(item.status)).length;
  const approvals = queue.filter((item) => item.status === "APPROVAL_PENDING").length;
  const blocked = queue.filter((item) => ["NEEDS_CLARIFICATION", "RISK_REVIEW", "DUPLICATE_REVIEW", "VERIFICATION_FAILED", "ERP_SYNC_FAILED"].includes(item.status)).length;

  const rows = allCases.data?.items ?? [];
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
  const blockedDelta = periodDelta(rows, (item) =>
    ["NEEDS_CLARIFICATION", "RISK_REVIEW", "DUPLICATE_REVIEW", "VERIFICATION_FAILED", "ERP_SYNC_FAILED"].includes(item.status));

  return (
    <div className="min-h-full p-6 lg:p-12">
      <header className="mb-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
        <div>
          <p className="mb-1 text-sm font-bold text-[var(--color-accent)]">Supplier onboarding control room</p>
          <h1 className="font-display text-3xl font-bold">Operational overview</h1>
          <p className="mt-2 text-[var(--color-muted)]">Live case state from the durable workflow—no simulated agent trace.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/cases/new"><Button variant="primary">New supplier</Button></Link>
        </div>
      </header>

      {cases.isError && <div role="alert" className="mb-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">Unable to load the work queue. Check your role and integration health.</div>}

      <section {...metricsAssistance} className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3" aria-label="Case metrics">
        {[
          { label: "Active cases", value: pending, icon: Clock3, detail: "Across all processing states", delta: activeDelta },
          { label: "Awaiting approval", value: approvals, icon: ShieldCheck, detail: "Evidence-bound human decisions", delta: approvalDelta },
          { label: "Needs attention", value: blocked, icon: FileText, detail: "Blocked without stopping other services", delta: blockedDelta },
        ].map((metric) => (
          <Card key={metric.label}>
            <div className="flex items-start justify-between">
              <p className="text-sm font-bold text-[var(--color-muted)]">{metric.label}</p>
              <DeltaBadge delta={metric.delta} />
            </div>
            <p className="my-1 font-display text-4xl font-extrabold text-[var(--color-ink)]">{metric.value}</p>
            <p className="text-xs text-[var(--color-muted)]">{metric.detail}</p>
          </Card>
        ))}
      </section>

      <div className="space-y-6">
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
      </div>
    </div>
  );
}
