"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Compass, MapPin, X } from "lucide-react";

import { useAuth } from "@/app/providers";
import { stepsForRoles, toursForRoles } from "@/lib/tours";

export interface TourPickerProps {
  onSelect: (tourId: string) => void;
  onClose: () => void;
}

/** Lists the tours this user can actually complete, and what each one covers. */
export function TourPicker({ onSelect, onClose }: TourPickerProps) {
  const { roles } = useAuth();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // No SSR guard needed: the picker only mounts on user interaction, long
  // after hydration, so `document` is always present here.
  const tours = toursForRoles(roles);

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close tour picker"
        className="absolute inset-0 cursor-default bg-[rgba(15,23,42,0.55)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-picker-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)] text-white">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="tour-picker-title" className="font-display text-lg font-bold">
              Take a tour
            </h2>
            <p className="text-sm text-[var(--color-muted)]">
              Pick a walkthrough. You can leave at any point.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {tours.map((tour) => {
            const steps = stepsForRoles(tour, roles);
            // Flag multi-route tours: auto-navigation should not be a surprise.
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
              </button>
            );
          })}
          {tours.length === 0 && (
            <p className="p-4 text-sm text-[var(--color-muted)]">
              No tours are available for your role.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
