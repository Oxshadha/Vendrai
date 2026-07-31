"use client";

import * as React from "react"
import { Table, Thead, Th, Tr, Td } from "@/components/ui/table"

export interface DotMatrixPoint {
  label: string;
  /** Rendered as the darker, bottom series of dots. */
  a: number;
  /** Rendered as the paler, upper series of dots, stacked on top of `a`. */
  b: number;
}

export interface DotMatrixChartProps {
  data: DotMatrixPoint[];
  seriesALabel: string;
  seriesBLabel: string;
  /** Index of the column to render solid and call out with a value bubble. */
  highlightIndex?: number;
  formatValue?: (value: number) => string;
  ariaLabel: string;
}

const DOT_RADIUS = 3.5;
const DOT_GAP = 4;
const DOT_STEP = DOT_RADIUS * 2 + DOT_GAP;
const COLUMN_WIDTH = 22;
const COLUMN_GAP = 14;
const CHART_HEIGHT = 220;
const MAX_ROWS = Math.floor(CHART_HEIGHT / DOT_STEP);
/** Narrowest the columns are allowed to get before the chart scrolls instead. */
const MIN_PITCH = COLUMN_WIDTH + COLUMN_GAP;
/**
 * Widest they may stretch. Without a cap, a wide card pulls 14 columns to
 * ~64px apart and the dot matrix stops reading as a matrix -- it becomes a row
 * of unrelated pin-stripes. Past this the chart stays its natural size and
 * centres instead.
 */
const MAX_PITCH = 44;

/**
 * Bespoke "dot-matrix" bar chart: each column is a bottom-up stack of small
 * circles rather than a solid bar. Deliberately custom rather than a recharts
 * shape -- this exact pixel/pin-art look has no off-the-shelf equivalent, and
 * it is reserved for this one dashboard metric (see the redesign plan) rather
 * than replacing the Analytics page's standard line/bar charts.
 *
 * The SVG is drawn at real pixel size against the measured container rather
 * than scaled from a viewBox. Scaling shrank the day labels to illegibility on
 * a phone, and it silently broke the value bubble, which is HTML positioned in
 * container pixels and so drifted away from its column as soon as the viewBox
 * scale was not exactly 1. Columns stretch to fill a wide card and the whole
 * chart scrolls sideways once they would fall below their minimum pitch.
 */
function DotMatrixChart({
  data,
  seriesALabel,
  seriesBLabel,
  highlightIndex,
  formatValue = (value) => String(value),
  ariaLabel,
}: DotMatrixChartProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(0);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setAvailable(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const maxTotal = Math.max(1, ...data.map((point) => point.a + point.b));
  const columns = Math.max(1, data.length);
  const fitted = available > 0 ? available / columns : MIN_PITCH;
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, fitted));
  const width = Math.floor(pitch * columns);
  const height = CHART_HEIGHT + 28;

  const columnCentre = (index: number) => index * pitch + pitch / 2;
  const rowsFor = (point: DotMatrixPoint) =>
    Math.min(MAX_ROWS, Math.round(((point.a + point.b) / maxTotal) * MAX_ROWS));

  const highlighted = highlightIndex !== undefined ? data[highlightIndex] : undefined;

  return (
    <div>
      <div ref={scrollRef} role="img" aria-label={ariaLabel} className="overflow-x-auto">
        <div className="relative mx-auto" style={{ width }}>
          <svg width={width} height={height} aria-hidden="true">
            {data.map((point, index) => {
              const total = point.a + point.b;
              const rows = rowsFor(point);
              const aRows = Math.round((point.a / Math.max(1, total)) * rows);
              const x = columnCentre(index);
              const isHighlighted = index === highlightIndex;
              const baseY = CHART_HEIGHT;

              const dots: React.ReactNode[] = [];
              for (let row = 0; row < rows; row += 1) {
                const isSeriesA = row < aRows;
                dots.push(
                  <circle
                    key={row}
                    cx={x}
                    cy={baseY - row * DOT_STEP - DOT_RADIUS}
                    r={DOT_RADIUS}
                    className={
                      isHighlighted
                        ? "fill-[var(--color-accent)]"
                        : isSeriesA
                          ? "fill-emerald-500"
                          : "fill-emerald-200"
                    }
                  />
                );
              }

              return (
                <g key={point.label}>
                  {dots}
                  {isHighlighted && rows > 0 && (
                    <line
                      x1={x}
                      y1={baseY - rows * DOT_STEP}
                      x2={x}
                      y2={0}
                      className="stroke-slate-300"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}
                  <text
                    x={x}
                    y={CHART_HEIGHT + 18}
                    textAnchor="middle"
                    className="fill-[var(--color-muted)] text-[10px] font-medium"
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {highlightIndex !== undefined && highlighted && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-[var(--shadow-md)]"
              style={{
                left: columnCentre(highlightIndex),
                top: CHART_HEIGHT - rowsFor(highlighted) * DOT_STEP,
              }}
            >
              {formatValue(highlighted.a + highlighted.b)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{seriesALabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-200" />{seriesBLabel}</span>
      </div>
      <Table className="sr-only">
        <caption>{ariaLabel}</caption>
        <Thead>
          <Tr>
            <Th>Date</Th>
            <Th>{seriesALabel}</Th>
            <Th>{seriesBLabel}</Th>
          </Tr>
        </Thead>
        <tbody>
          {data.map((point) => (
            <Tr key={point.label}>
              <Td>{point.label}</Td>
              <Td>{point.a}</Td>
              <Td>{point.b}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export { DotMatrixChart };
