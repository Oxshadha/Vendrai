"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { useGetWorkQueueApiV1WorkQueueGet } from "@/generated/neurox";
import type { WorkQueueItem } from "@/generated/models";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusChip } from "@/components/status-chip";
import { useAssistanceTarget } from "@/components/assistance-registry";

export type CaseType = "VENDOR_ONBOARDING" | "INVOICE_EXCEPTION";

const DEFAULT_FILTERS = { status: "", priority: "", ownership: "ALL" };

export interface CaseQueuePanelProps {
  caseType: CaseType;
  title: string;
  description: string;
  /** Assistance/tour target registered on the panel. */
  assistanceId: string;
  assistanceTitle: string;
  assistanceDescription: string;
  /** Layout hooks from the page, e.g. stacking order at narrow widths. */
  className?: string;
}

/**
 * Prior work for one case type, shown beside its intake form.
 *
 * This used to be a single combined queue on the dashboard, which mixed
 * supplier onboarding and invoice exceptions into one list and made the case
 * type filter do the separating. Pinning the type per panel means the filter
 * disappears and each workflow keeps its own saved view.
 */
export function CaseQueuePanel({
  caseType,
  title,
  description,
  assistanceId,
  assistanceTitle,
  assistanceDescription,
  className,
}: CaseQueuePanelProps) {
  const assistance = useAssistanceTarget({
    id: assistanceId,
    title: assistanceTitle,
    description: assistanceDescription,
  });
  // Scoped per case type so the two panels do not fight over one saved view.
  const storageKey = `vendrai-queue-filters.${caseType}`;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return DEFAULT_FILTERS;
    try {
      return { ...DEFAULT_FILTERS, ...(JSON.parse(saved) as Partial<typeof DEFAULT_FILTERS>) };
    } catch {
      return DEFAULT_FILTERS;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);

  const cases = useGetWorkQueueApiV1WorkQueueGet({
    case_type: caseType,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    ownership: filters.ownership,
  });

  const items = cases.data?.items;
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (items ?? []).filter(
      (item) =>
        !needle
        || item.title.toLowerCase().includes(needle)
        || item.case_number.toLowerCase().includes(needle),
    );
  }, [items, search]);

  return (
    /*
     * Sticks below the floating nav and is sized against the viewport rather
     * than a fixed height, so the list always ends on screen instead of being
     * cut off, and stays in reach while the form beside it scrolls.
     */
    <Card
      {...assistance}
      padding="none"
      // `self-start` matters: a grid item stretches to the row height by
      // default, which leaves sticky with nothing to move within. The height
      // cap is xl-only: stacked above the form on a phone, a viewport-tall
      // list with its own scroller is a wall between the user and the thing
      // they came to do, so there it just sizes to its content.
      className={`flex max-h-[32rem] flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start ${className ?? ""}`}
    >
      <div className="shrink-0 border-b border-[var(--color-border)] p-5">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>

        <div className="relative mt-4">
          <Search
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label={`Search ${title}`}
            className="pl-10"
          />
        </div>

        <div className="mt-3 grid gap-2">
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="NEEDS_CLARIFICATION">Needs clarification</option>
            <option value="DUPLICATE_REVIEW">Duplicate review</option>
            <option value="RISK_REVIEW">Risk review</option>
            <option value="APPROVAL_PENDING">Approval pending</option>
            <option value="ERP_SYNC_FAILED">ERP retry</option>
            <option value="COMPLETED">Completed</option>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label="Priority"
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            >
              <option value="">All priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </Select>
            <Select
              aria-label="Ownership"
              value={filters.ownership}
              onChange={(event) => setFilters((current) => ({ ...current, ownership: event.target.value }))}
            >
              <option value="ALL">All ownership</option>
              <option value="MINE">Mine</option>
              <option value="UNCLAIMED">Unclaimed</option>
            </Select>
          </div>
        </div>

        {(filters.status || filters.priority || filters.ownership !== "ALL" || search) && (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setSearch("");
            }}
          >
            Reset saved view
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 divide-y divide-[var(--color-border)] overflow-y-auto">
        {cases.isLoading && (
          <p className="p-5 text-sm text-[var(--color-muted)]" aria-live="polite">
            Loading cases…
          </p>
        )}
        {cases.isError && (
          <p role="alert" className="p-5 text-sm text-rose-800">
            Unable to load this queue. Check your role and integration health.
          </p>
        )}
        {!cases.isLoading && !cases.isError && filtered.length === 0 && (
          <p className="p-5 text-sm text-[var(--color-muted)]">Nothing here yet.</p>
        )}
        {filtered.map((item: WorkQueueItem) => (
          <Link
            key={item.case_id}
            href={`/cases/${item.case_id}`}
            className="block p-4 transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <p className="font-mono text-[11px] text-[var(--color-muted)]">{item.case_number}</p>
            <p className="mt-1 truncate font-bold">{item.title}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[var(--color-muted)]">
                {item.priority.toLowerCase()} · {item.ownership.toLowerCase()} ·{" "}
                {Math.max(1, Math.round(item.age_seconds / 3600))}h old
              </span>
              <StatusChip status={item.status} />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
