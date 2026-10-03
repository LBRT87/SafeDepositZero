import { clsx } from "clsx";

/**
 * The brand arc: a thick, flat emerald quarter-curve, echoing the sweep of the logo's steel frame.
 * Used in exactly two places: the landing hero and the certificate seal.
 */
export function BrandArc({ className, strokeWidth = 34, draw }: { className?: string; strokeWidth?: number; draw?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={clsx("block", draw && "arc-draw", className)} fill="none">
      <path
        pathLength={1}
        d={`M ${strokeWidth / 2} 200 A ${200 - strokeWidth / 2} ${200 - strokeWidth / 2} 0 0 1 200 ${strokeWidth / 2}`}
        stroke="var(--color-brand-500)"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
      />
    </svg>
  );
}

/** The SafeDeposit Zero logo (public/brand/logo-mark.png, cut out of Logo.jpg). Transparent, so it sits on any surface. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-mark.png" alt="" width={64} height={64} className="size-full object-contain" />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8 sm:size-9" />
      <span className="whitespace-nowrap font-display text-[19px] font-semibold leading-none tracking-[-0.01em] text-ink sm:text-[22px]">
        SafeDeposit Zero
      </span>
    </span>
  );
}

/**
 * Certificate seal: 88px flat emerald disc, cut by the brand arc, with "Backed by the SafeDeposit Zero pool" around it
 * and a thin violet ring, the circuit light from the logo.
 */
export function Seal({ className, stamp }: { className?: string; stamp?: boolean }) {
  return (
    <div className={clsx("relative size-[88px] shrink-0", stamp && "animate-stamp", className)}>
      <svg viewBox="0 0 120 120" className="size-full" aria-label="Backed by the SafeDeposit Zero pool" role="img">
        <defs>
          <path id="seal-text" d="M 60 60 m -40 0 a 40 40 0 1 1 80 0 a 40 40 0 1 1 -80 0" />
        </defs>
        <circle cx="60" cy="60" r="56" fill="var(--color-brand-700)" />
        <circle cx="60" cy="60" r="56" fill="none" stroke="var(--color-accent-500)" strokeWidth="2" />
        <circle cx="60" cy="60" r="29" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.25" />
        {/* The arc cutting through the seal: a white gap with an emerald sweep inside it. */}
        <path d="M 14 116 A 102 102 0 0 1 116 14" stroke="#FFFFFF" strokeWidth="13" fill="none" />
        <path d="M 14 116 A 102 102 0 0 1 116 14" stroke="var(--color-brand-500)" strokeWidth="7" fill="none" />
        <text fontFamily="var(--font-hanken), sans-serif" fontSize="10" fontWeight="600" fill="#FFFFFF" letterSpacing="0.3">
          <textPath href="#seal-text" startOffset="0%">
            Backed by the SafeDeposit Zero pool
          </textPath>
        </text>
        <path d="M49 61 l7 7 l14 -16" stroke="#FFFFFF" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
