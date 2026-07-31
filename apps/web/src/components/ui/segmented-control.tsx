import * as React from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"

export interface SegmentedItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  href?: string;
}

export interface SegmentedControlProps {
  items: SegmentedItem[];
  value: string;
  onChange?: (value: string) => void;
  role?: 'tablist' | 'group';
  "aria-label"?: string;
  /**
   * `muted` draws the usual grey pill-track. `transparent` drops it so the
   * control can sit directly on an existing surface -- used by the frosted
   * top nav, where a second opaque track would fight the glass.
   */
  track?: 'muted' | 'transparent';
  className?: string;
  itemClassName?: string;
  /**
   * Applied to the label text only, so a caller can hide it at narrow widths
   * and leave icon-only pills behind. The accessible name is carried by
   * `aria-label` on every item, so hiding the text costs nothing.
   */
  labelClassName?: string;
}

/**
 * Pill-track segmented control. Items with `href` render as links (powers
 * the top nav); items without render as buttons and call `onChange` (powers
 * tab-style selectors such as the document viewer's page/document switcher).
 * `role="tablist"` preserves the same aria-selected semantics a manually
 * hand-rolled tablist would have.
 */
function SegmentedControl({ items, value, onChange, role, track = 'muted', className, itemClassName, labelClassName, ...rest }: SegmentedControlProps) {
  return (
    <div
      role={role}
      aria-label={rest["aria-label"]}
      className={`inline-flex items-center gap-1 rounded-full p-1 ${track === 'muted' ? "bg-[var(--color-surface-muted)]" : ""} ${className ?? ""}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        const content = (
          <>
            {item.icon && <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span className={labelClassName}>{item.label}</span>
          </>
        );
        const classes = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition-all duration-200 sm:px-4 ${
          active
            ? "border border-[var(--color-border)] bg-white text-[var(--color-ink)] shadow-[var(--shadow-xs)]"
            : "border border-transparent text-[var(--color-muted)] hover:bg-white/60 hover:text-[var(--color-ink)]"
        } ${itemClassName ?? ""}`;

        if (item.href) {
          return (
            <Link
              key={item.value}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={classes}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.value}
            type="button"
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-label={item.label}
            title={item.label}
            className={classes}
            onClick={() => onChange?.(item.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
