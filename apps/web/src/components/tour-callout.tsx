"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { useTargetRect } from "@/components/spotlight-overlay";

const PADDING = 12;
const GAP = 14;
const CALLOUT_WIDTH = 380;
/** Only used for the first frame, before the bubble has been measured. */
const FALLBACK_HEIGHT = 215;
/** Below this the bubble becomes an edge-pinned sheet rather than a pointer. */
const SHEET_BREAKPOINT = 640;

/** Viewport size, re-read on resize and rotation. */
function useViewport() {
  const [size, setSize] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return size;
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

/**
 * The step bubble. The dim and ring are drawn by SpotlightOverlay; this only
 * positions itself against the same rect, gliding between steps rather than
 * teleporting, and flipping side when it would leave the viewport.
 */
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
  const reduceMotion = useReducedMotion();
  const viewport = useViewport();
  const calloutRef = useRef<HTMLElement | null>(null);
  /*
   * Measured, not estimated. A fixed guess was roughly right on desktop and
   * badly wrong on a phone, where the same copy wraps to twice the height --
   * so the bubble was placed as if it were short and ran off the screen.
   */
  const [height, setHeight] = useState(FALLBACK_HEIGHT);

  useLayoutEffect(() => {
    const node = calloutRef.current;
    if (!node) return;
    setHeight(node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
      if (event.key === "ArrowRight") onNext();
      if (event.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip, onNext, onBack]);

  const isLast = index === total - 1;
  const compact = viewport.width < SHEET_BREAKPOINT;
  const width = Math.min(CALLOUT_WIDTH, viewport.width - 2 * PADDING);
  const maxHeight = viewport.height - 2 * PADDING;
  /** Which half of the screen the target sits in, used to pick the far edge. */
  const targetInLowerHalf = rect
    ? rect.top + rect.height / 2 > viewport.height / 2
    : true;

  let top: number;
  let left: number;
  if (compact) {
    // Phones: a full-width sheet pinned to the edge furthest from the target,
    // so the bubble never covers the thing it is describing.
    left = (viewport.width - width) / 2;
    top = targetInLowerHalf ? PADDING : viewport.height - height - PADDING;
  } else if (!rect) {
    top = viewport.height - height - PADDING;
    left = viewport.width / 2 - width / 2;
  } else {
    // Prefer below the target, flip above when it would overflow, and fall
    // back to the far edge rather than always the bottom -- the old bottom
    // pin buried low targets underneath their own callout.
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - height;
    top =
      below + height <= viewport.height - PADDING
        ? below
        : above >= PADDING
          ? above
          : targetInLowerHalf
            ? PADDING
            : viewport.height - height - PADDING;
    left = Math.min(
      Math.max(PADDING, rect.left + rect.width / 2 - width / 2),
      viewport.width - width - PADDING,
    );
  }
  top = Math.max(PADDING, top);

  return createPortal(
    <motion.aside
      ref={calloutRef}
      role="dialog"
      aria-label="Guided tour"
      aria-live="polite"
      className="fixed z-[70] overflow-y-auto overscroll-contain rounded-2xl bg-[var(--color-ink)] p-4 text-white shadow-[var(--shadow-xl)] sm:p-5"
      style={{ maxHeight }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.96, top, left, width }}
      animate={{ opacity: 1, scale: 1, top, left, width }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 320,
              damping: 34,
              mass: 0.7,
              opacity: { duration: 0.18 },
              scale: { duration: 0.18 },
            }
      }
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
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-secondary)]"
          animate={{ width: `${((index + 1) / total) * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
        />
      </div>

      {/* Keyed on the step so the copy cross-fades rather than snapping. */}
      <motion.div
        key={index}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mt-3 font-bold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/70">{body}</p>
      </motion.div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-xl px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onSkip}
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {busy && <LoaderCircle className="h-4 w-4 animate-spin text-white/50" aria-hidden="true" />}
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
    </motion.aside>,
    document.body,
  );
}
