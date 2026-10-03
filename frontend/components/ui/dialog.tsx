"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <D.Content className="data-[state=closed]:animate-scale-out data-[state=open]:animate-scale-in fixed inset-0 z-50 m-auto h-fit max-h-[calc(100%-32px)] w-[calc(100%-32px)] max-w-[480px] overflow-y-auto rounded-dialog bg-surface p-6 shadow-pop focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <D.Title className="font-display text-2xl font-semibold leading-8 tracking-[-0.01em]">{title}</D.Title>
            <D.Close className="-mr-2 -mt-1 rounded-btn p-2 text-muted hover:bg-ghost" aria-label="Close">
              <X className="size-[18px]" strokeWidth={1.75} />
            </D.Close>
          </div>
          {description && <D.Description className="mt-2 text-[15px] text-muted">{description}</D.Description>}
          {children && <div className="mt-4">{children}</div>}
          {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
