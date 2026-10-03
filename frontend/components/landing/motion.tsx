"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Strong ease-out (cubic-bezier(0.23, 1, 0.32, 1) in spirit) for JS-driven tweens. */
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True once the element has scrolled into view (and stays true). Content is visible by default: elements that are
 * already on screen at mount never get hidden, so nothing flashes and nothing disappears if scripts fail.
 */
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

/** Tweens a number from `from` to `to` when `run` turns true (or whenever `to` changes after that). */
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
    // rAF pauses in hidden tabs: make sure the final figure lands even if no frame ever runs.
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

/** A figure that counts up from zero the first time it scrolls into view. */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const v = useTween(value, { run: inView, from: 0, duration: 1100 });
  return (
    <span ref={ref} className={clsx("nums", className)}>
      {/* Screen readers get the final figure, not the animation. */}
      <span aria-hidden>{format(inView ? v : 0)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Fades and lifts a block in once, the first time it scrolls into view. `delay` staggers siblings in a list. */
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
