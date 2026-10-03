"use client";

import { Tabs as T } from "radix-ui";
import type { ReactNode } from "react";

export function Tabs({
  value,
  onValueChange,
  items,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: string; content: ReactNode }[];
}) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="flex gap-1 border-b border-line">
        {items.map((i) => (
          <T.Trigger
            key={i.value}
            value={i.value}
            className="-mb-px h-11 border-b-[3px] border-transparent px-3 transition-colors duration-200 text-[15px] font-semibold text-muted hover:text-ink data-[state=active]:border-brand-700 data-[state=active]:text-ink"
          >
            {i.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((i) => (
        <T.Content key={i.value} value={i.value} className="pt-5 focus-visible:outline-none data-[state=active]:animate-fade-in">
          {i.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
