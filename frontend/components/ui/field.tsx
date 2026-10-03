"use client";

import { clsx } from "clsx";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "w-full rounded-btn border border-line-strong bg-white px-[14px] text-[15px] text-ink placeholder:text-muted " +
  "outline-none transition-[border-color,box-shadow] duration-[120ms] " +
  "focus:border-brand-700 focus:shadow-[0_0_0_3px_rgba(106,27,154,0.15)] focus-visible:outline-none " +
  "disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-alert";

export function Field({
  label,
  helper,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="t-label text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="t-small text-alert" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="t-small text-muted">{helper}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(control, "h-11", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(control, "min-h-24 py-3 leading-6", className)}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(control, "h-11 appearance-none bg-[length:16px] pr-10", className)} {...rest} style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23625A6E' stroke-width='1.75'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 14px center",
    }}>
      {children}
    </select>
  );
}

/** Right-aligned tabular amount with a muted "USDG" suffix and an optional "Max" ghost button inside. */
export function AmountInput({
  value,
  onChange,
  onMax,
  invalid,
  id,
  placeholder = "0.00",
  disabled,
  suffix = "USDG",
}: {
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
}) {
  const fallbackId = useId();
  return (
    <div className="relative">
      <input
        id={id ?? fallbackId}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className={clsx(control, "nums h-11 text-right", onMax ? "pr-[118px]" : "pr-[64px]")}
      />
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
        <span className="t-small text-muted pr-1">{suffix}</span>
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="pointer-events-auto h-8 rounded-[8px] px-2.5 text-[13px] font-semibold text-ink hover:bg-ghost active:bg-ghost-press disabled:opacity-40"
          >
            Max
          </button>
        )}
      </div>
    </div>
  );
}
