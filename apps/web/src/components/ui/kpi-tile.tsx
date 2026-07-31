import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Card } from "@/components/ui/card"

/**
 * How to read a rise in this measure. Colouring every increase green and every
 * decrease red is the easy mistake: three more blocked cases is not good news.
 * `neutral` is the honest default for volume counts, which are neither.
 */
export type KpiDirection = "up-good" | "up-bad" | "neutral";

export interface KpiTileProps {
  label: string;
  /** Pre-formatted, including any unit. Use an em dash for "not available". */
  value: string;
  /** One line on what the number counts, or where it came from. */
  detail?: string;
  icon?: LucideIcon;
  delta?: number;
  /** Appended to the delta, e.g. "%" or "h". */
  deltaSuffix?: string;
  /** What the delta is measured against, e.g. "vs last week". */
  deltaCaption?: string;
  direction?: KpiDirection;
  /** Rendered under the value, e.g. a definition or a numerator/denominator. */
  footnote?: React.ReactNode;
}

const TONE: Record<"good" | "bad" | "neutral", string> = {
  good: "text-emerald-700",
  bad: "text-rose-700",
  neutral: "text-[var(--color-muted)]",
};

function toneFor(delta: number, direction: KpiDirection): "good" | "bad" | "neutral" {
  if (delta === 0 || direction === "neutral") return "neutral";
  const rising = delta > 0;
  return (direction === "up-good") === rising ? "good" : "bad";
}

/**
 * One measure, one tile. Deliberately not a chart: a single current figure has
 * no shape to plot, so it gets a hero number, its label, and just enough
 * context to be actionable -- the direction of travel and what it is counted
 * from. Everything except the arrow wears text tokens rather than a hue, so
 * colour only ever appears where it carries meaning.
 */
function KpiTile({
  label,
  value,
  detail,
  icon: Icon,
  delta,
  deltaSuffix = "",
  deltaCaption,
  direction = "neutral",
  footnote,
}: KpiTileProps) {
  const tone = delta === undefined ? "neutral" : toneFor(delta, direction);
  const Arrow = delta !== undefined && delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-[var(--color-muted)]">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />}
      </div>
      <p className="my-1 font-display text-3xl font-extrabold text-[var(--color-ink)] sm:text-4xl">
        {value}
      </p>
      {delta !== undefined && delta !== 0 && (
        <p className={`flex items-center gap-1 text-xs font-bold ${TONE[tone]}`}>
          <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {delta > 0 ? "+" : ""}
          {delta}
          {deltaSuffix}
          {deltaCaption && (
            <span className="font-medium text-[var(--color-muted)]">{deltaCaption}</span>
          )}
        </p>
      )}
      {detail && <p className="mt-1 text-xs text-[var(--color-muted)]">{detail}</p>}
      {footnote && <div className="mt-auto pt-3">{footnote}</div>}
    </Card>
  );
}

export { KpiTile };
