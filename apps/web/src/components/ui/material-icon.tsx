/**
 * Google Material Symbols, inlined as SVG.
 *
 * Deliberately not the Material Symbols icon font: that renders its glyphs
 * from ligatures, so before the font loads the browser paints the literal
 * ligature text ("auto_awesome") in the layout. Inlining the official path
 * data avoids that flash, ships no extra font request, and keeps the same
 * currentColor/size contract as the lucide icons used elsewhere.
 *
 * Path data is Google's own, on the Material Symbols 0 -960 960 960 grid.
 */

const PATHS = {
  auto_awesome:
    "m760-600-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110Zm0 560-50-110-110-50 110-50 50-110 50 110 110 50-110 50-50 110ZM360-160 260-380 40-480l220-100 100-220 100 220 220 100-220 100-100 220Zm0-194 40-86 86-40-86-40-40-86-40 86-86 40 86 40 40 86Zm0-126Z",
  waving_hand:
    "m430-500 283-283q12-12 28-12t28 12q12 12 12 28t-12 28L487-444l-57-56Zm99 99 254-255q12-12 28.5-12t28.5 12q12 12 12 28.5T840-599L586-345l-57-56ZM211-211q-91-91-91-219t91-219l120-120 59 59q7 7 12 14.5t10 15.5l148-149q12-12 28.5-12t28.5 12q12 12 12 28.5T617-772L444-599l-85 84 19 19q46 46 44 110t-49 111l-57-56q23-23 25.5-54.5T321-440l-47-46q-12-12-12-28.5t12-28.5l57-56q12-12 12-28.5T331-656l-64 64q-68 68-68 162.5T267-267q68 68 163 68t163-68l239-240q12-12 28.5-12t28.5 12q12 12 12 28.5T889-450L649-211q-91 91-219 91t-219-91Zm219-219ZM680-39v-81q66 0 113-47t47-113h81q0 100-70.5 170.5T680-39ZM39-680q0-100 70.5-170.5T280-921v81q-66 0-113 47t-47 113H39Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
} as const;

export type MaterialIconName = keyof typeof PATHS;

export interface MaterialIconProps {
  name: MaterialIconName;
  className?: string;
  /** Give this when the icon carries meaning; omit to leave it decorative. */
  label?: string;
}

export function MaterialIcon({ name, className, label }: MaterialIconProps) {
  return (
    <svg
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={className ?? "h-4 w-4"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
