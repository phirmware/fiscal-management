import type { SelectHTMLAttributes } from "react";

/**
 * Native <select> with a consistent custom chevron across browsers.
 * The grid overlays the chevron on the select's right padding zone.
 */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="grid w-full grid-cols-[1fr_2rem]">
      <select
        {...rest}
        className={`input-base col-span-full row-start-1 appearance-none !pr-8 ${className ?? ""}`}
      >
        {children}
      </select>
      <svg
        viewBox="0 0 8 5"
        width="8"
        height="5"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none col-start-2 row-start-1 place-self-center text-ink-muted"
      >
        <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
      </svg>
    </span>
  );
}
