"use client";

import { ChevronRight, MapPin } from "lucide-react";

import { useAuth } from "@/app/providers";
import { stepsForRoles, toursForRoles } from "@/lib/tours";

/**
 * The tour chooser, rendered as a face of the assistant panel rather than a
 * separate modal. Stacking a second dialog on top of the panel meant two
 * overlapping surfaces for one decision.
 */
export function CopilotTourList({ onSelect }: { onSelect: (tourId: string) => void }) {
  const { roles } = useAuth();
  const tours = toursForRoles(roles);

  return (
    <div className="flex flex-col gap-2 p-4">
      {tours.map((tour) => {
        const steps = stepsForRoles(tour, roles);
        // Flag multi-route tours: being navigated away should not be a surprise.
        const routes = new Set(steps.map((step) => step.route).filter(Boolean));
        return (
          <button
            key={tour.id}
            type="button"
            onClick={() => onSelect(tour.id)}
            className="group flex w-full items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface)] hover:shadow-[var(--shadow-sm)]"
          >
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] transition-transform duration-200 group-hover:scale-110">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--color-ink)]">{tour.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">
                {tour.summary}
              </span>
              <span className="mt-1.5 block text-[11px] text-[var(--color-muted)]">
                {steps.length} step{steps.length === 1 ? "" : "s"}
                {routes.size > 1 && " · moves between pages"}
              </span>
            </span>
            <ChevronRight
              className="mt-1 h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        );
      })}
      {tours.length === 0 && (
        <p className="p-4 text-sm text-[var(--color-muted)]">No tours are available for your role.</p>
      )}
    </div>
  );
}
