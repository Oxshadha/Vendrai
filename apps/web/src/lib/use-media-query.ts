"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * Layout should be done in CSS wherever it can be. This is for the cases that
 * cannot: component props that take pixel numbers rather than classes --
 * recharts axis widths, chart column counts -- where the value itself has to
 * change, not just the styling around it.
 *
 * Starts false on the server and on the first client render so the markup
 * matches during hydration, then settles in a layout-safe effect.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Tailwind's `sm` breakpoint, inverted: true below 640px. */
export function useIsNarrow(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
