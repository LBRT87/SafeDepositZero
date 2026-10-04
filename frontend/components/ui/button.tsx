"use client";

import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "./tooltip";

export type ButtonVariant = "primary" | "success" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 active:translate-y-px",
  success: "bg-green-700 text-white hover:bg-green-800 active:bg-green-900 active:translate-y-px",
  secondary:
    "bg-white text-brand-700 border-[1.5px] border-brand-700 hover:bg-brand-50 active:bg-brand-100 active:translate-y-px",
  ghost: "bg-transparent text-ink hover:bg-ghost active:bg-ghost-press",
  destructive: "bg-alert text-white hover:bg-alert-800 active:bg-alert-900 active:translate-y-px",
  link: "bg-transparent text-brand-700 hover:underline decoration-2 underline-offset-[3px] !px-0 !h-auto",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] leading-[18px] gap-1.5 [&_svg]:size-4",
  md: "h-10 px-4 text-[15px] leading-5 gap-2 [&_svg]:size-[18px]",
  lg: "h-12 px-[22px] text-[17px] leading-6 gap-2.5 [&_svg]:size-5",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-btn font-semibold tracking-[0.005em]",
    "transition-[background-color,border-color,color,transform] duration-150 ease-out select-none",
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner + in-progress label; disabled. */
  loading?: boolean;
  loadingText?: string;
  /** Disables the button and explains why. */
  disabledReason?: string | null;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, loadingText, disabledReason, icon, className, children, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading || !!disabledReason;
  const btn = (
    <button
      ref={ref}
      className={buttonClass(variant, size, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          <span>{loadingText ?? "Confirming…"}</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
  if (disabledReason && !loading) {
    return (
      <Tooltip content={disabledReason}>
        <span className="inline-flex" tabIndex={0} aria-label={disabledReason}>
          {btn}
        </span>
      </Tooltip>
    );
  }
  return btn;
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
