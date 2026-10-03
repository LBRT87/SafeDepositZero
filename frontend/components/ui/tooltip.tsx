"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={200}>{children}</T.Provider>;
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 origin-(--radix-tooltip-content-transform-origin) max-w-64 rounded-btn bg-ink data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in px-3 py-2 text-[13px] leading-[18px] text-white shadow-pop"
        >
          {content}
          <T.Arrow className="fill-ink" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
