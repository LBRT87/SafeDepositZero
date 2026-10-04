"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Strong ease-out. */
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once in view. Visible by default, so nothing hides if JS fails. */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "in">("idle");
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setState("in");
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) {
      setState("in");
      return;
    }
    setState("waiting");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("in");
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, waiting: state === "waiting", inView: state === "in" };
}

/** Tweens a number when `run` turns true. */
export function useTween(to: number, { run = true, from, duration = 900 }: { run?: boolean; from?: number; duration?: number } = {}) {
  const [value, setValue] = useState(from ?? to);
  const current = useRef(from ?? to);
  useEffect(() => {
    if (!run) return;
    const start = current.current;
    if (start === to) return;
    const instant = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = instant ? 1 : easeOutExpo(Math.min(1, (now - t0) / duration));
      const v = start + (to - start) * k;
      current.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // rAF pauses in hidden tabs; land the final value anyway.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      current.current = to;
      setValue(to);
    }, duration + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [to, run, duration]);
  return value;
}

/** Counts up once when in view. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const v = useTween(value, { run: inView, from: 0, duration: 1100 });
  return (
    <span ref={ref} className={clsx("nums", className)}>
      {/* Final value for screen readers */}
      <span aria-hidden>{format(inView ? v : 0)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Fades a block in once; `delay` staggers. */
export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const { ref, waiting } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      className={clsx("reveal", className)}
      data-state={waiting ? "waiting" : "in"}
      style={{ transitionDelay: waiting ? "0ms" : `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
