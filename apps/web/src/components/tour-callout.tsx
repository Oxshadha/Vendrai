"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PADDING = 8;
const GAP = 14;
const CALLOUT_WIDTH = 380;
const ESTIMATED_HEIGHT = 210;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(element: HTMLElement | undefined): Rect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Tracks the target's viewport rect across scroll, resize and layout shifts.
 * The spotlight scrolls its target into view, so the rect is in motion for a
 * few frames after each step change and cannot be read just once.
 */
function useTargetRect(element: HTMLElement | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    // Measuring happens inside the frame callback rather than the effect body:
    // a synchronous setState here would cascade a render on every step change.
    let frame = window.requestAnimationFrame(function measure() {
      setRect((current) => {
        const next = readRect(element);
        if (!next || !current) return next;
        const same =
          Math.abs(next.top - current.top) < 0.5
          && Math.abs(next.left - current.left) < 0.5
          && Math.abs(next.width - current.width) < 0.5
          && Math.abs(next.height - current.height) < 0.5;
        return same ? current : next;
      });
      frame = window.requestAnimationFrame(measure);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [element]);

  // Derived rather than stored, so clearing needs no setState in the effect.
  return element ? rect : null;
}

/**
 * Full-viewport scrim with a cut-out over the target.
 *
 * Built from four rectangles rather than the previous `box-shadow: 0 0 0
 * 9999px` on the element itself: that approach is clipped by any ancestor with
 * `overflow: hidden`, which broke the dim on cards that scroll their content.
 */
function TourScrim({ rect }: { rect: Rect | null }) {
  if (!rect) {
    return <div className="fixed inset-0 z-[60] bg-[rgba(15,23,42,0.55)]" aria-hidden="true" />;
  }
  const top = Math.max(0, rect.top - PADDING);
  const left = Math.max(0, rect.left - PADDING);
  const right = rect.left + rect.width + PADDING;
  const bottom = rect.top + rect.height + PADDING;
  const band = "fixed z-[60] bg-[rgba(15,23,42,0.55)]";

  return (
    <div aria-hidden="true">
      <div className={band} style={{ top: 0, left: 0, right: 0, height: top }} />
      <div className={band} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={band} style={{ top, left: 0, width: left, height: bottom - top }} />
      <div className={band} style={{ top, left: right, right: 0, height: bottom - top }} />
      <div
        className="pointer-events-none fixed z-[61] rounded-2xl ring-4 ring-[var(--color-accent)]"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    </div>
  );
}

export interface TourCalloutProps {
  target: HTMLElement | undefined;
  title: string;
  body: string;
  index: number;
  total: number;
  busy?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function TourCallout({
  target,
  title,
  body,
  index,
  total,
  busy,
  onBack,
  onNext,
  onSkip,
}: TourCalloutProps) {
  const rect = useTargetRect(target);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  // No SSR guard needed: a tour only starts on user interaction, well after
  // hydration, so `document` and `window` are always present here.
  const isLast = index === total - 1;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(CALLOUT_WIDTH, viewportWidth - 2 * PADDING);

  // Prefer below the target, flip above when it would run off, and fall back to
  // pinning at the bottom when there is no rect to anchor to.
  let style: React.CSSProperties;
  if (!rect) {
    style = { bottom: 16, left: "50%", transform: "translateX(-50%)", width };
  } else {
    const below = rect.top + rect.height + PADDING + GAP;
    const fitsBelow = below + ESTIMATED_HEIGHT <= viewportHeight - PADDING;
    const above = rect.top - PADDING - GAP - ESTIMATED_HEIGHT;
    const fitsAbove = above >= PADDING;
    const top = fitsBelow ? below : fitsAbove ? above : Math.max(PADDING, viewportHeight - ESTIMATED_HEIGHT - PADDING);
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(PADDING, centred), viewportWidth - width - PADDING);
    style = { top, left, width };
  }

  return createPortal(
    <>
      <TourScrim rect={rect} />
      <aside
        role="dialog"
        aria-label="Guided tour"
        aria-live="polite"
        className="fixed z-[70] rounded-2xl bg-[var(--color-ink)] p-5 text-white shadow-[var(--shadow-xl)]"
        style={style}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-accent-secondary)]">
            Guided tour
          </span>
          <span className="text-[11px] text-white/50">
            step {index + 1} of {total}
          </span>
        </div>

        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-secondary)] transition-[width] duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>

        <p className="mt-3 font-bold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/70">{body}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            onClick={onSkip}
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={index === 0 || busy}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-40"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[var(--color-accent-dark)] to-[var(--color-accent)] px-4 py-2 text-sm font-bold transition-all duration-200 hover:brightness-110 disabled:opacity-60"
              onClick={onNext}
            >
              {isLast ? "Finish" : "Next"}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}
