"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

function readRect(element: HTMLElement | undefined): Rect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    top: rect.top - PADDING,
    left: rect.left - PADDING,
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };
}

/**
 * Tracks a target's viewport rect. A frame loop rather than a one-shot read:
 * the spotlight smooth-scrolls its target into view, so the rect is still
 * moving for a while after each step change.
 */
export function useTargetRect(element: HTMLElement | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    // Measured inside the frame callback, not the effect body, so this does
    // not cascade a synchronous render on every step change.
    let frame = window.requestAnimationFrame(function measure() {
      setRect((current) => {
        const next = readRect(element);
        if (!next || !current) return next;
        const settled =
          Math.abs(next.top - current.top) < 0.5
          && Math.abs(next.left - current.left) < 0.5
          && Math.abs(next.width - current.width) < 0.5
          && Math.abs(next.height - current.height) < 0.5;
        return settled ? current : next;
      });
      frame = window.requestAnimationFrame(measure);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [element]);

  return element ? rect : null;
}

/**
 * Dims the page and rings the spotlit element.
 *
 * One element carrying a huge spread shadow, rendered through a portal on
 * document.body. The scrim used to be applied to the target itself, where any
 * ancestor with `overflow: hidden` clipped it; portalling escapes that, and a
 * single animated box means the highlight glides between steps instead of
 * teleporting.
 */
export function SpotlightOverlay({ target }: { target: HTMLElement | undefined }) {
  const rect = useTargetRect(target);
  const reduceMotion = useReducedMotion();

  if (!target || !rect) return null;

  return createPortal(
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] rounded-2xl"
      initial={{ opacity: 0, top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      animate={{ opacity: 1, top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      exit={{ opacity: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 320, damping: 34, mass: 0.7, opacity: { duration: 0.18 } }
      }
      style={{
        boxShadow:
          "0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 0 3px var(--color-accent), 0 0 24px rgba(37, 99, 235, 0.45)",
      }}
    />,
    document.body,
  );
}
