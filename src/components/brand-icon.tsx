import type { SVGProps } from "react";

/** The NodeBrainer "N" of linked nodes, drawn on lucide's 24px grid so it matches the other icons. */
export function NodeBrainerIcon({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Links stop at each node's edge so no line shows through the rings. */}
      <path d="M6 7v10M7.3 6.5l3.4 4M10.7 13.5l-3.4 4M13.3 13.5l3.4 4M18 17V7" />
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="19" r="2" />
      {/* The filled node echoes the highlighted node in the original logo. */}
      <circle cx="18" cy="5" r="2" fill="currentColor" />
    </svg>
  );
}
