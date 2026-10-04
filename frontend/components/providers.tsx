"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { IS_MOCK } from "@/lib/data";
import { DataSync } from "@/lib/hooks";
import { SessionProvider } from "@/lib/session";
import { ToastProvider } from "./ui/toast";
import { TooltipProvider } from "./ui/tooltip";

// wagmi and RainbowKit load in onchain mode only.
const OnchainProviders = dynamic(() => import("./onchain-providers"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 1 } } }));
  const inner = (
    <SessionProvider>
      <TooltipProvider>
        <ToastProvider>
          <DataSync />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </SessionProvider>
  );
  return (
    <QueryClientProvider client={qc}>
      {IS_MOCK ? inner : <OnchainProviders>{inner}</OnchainProviders>}
    </QueryClientProvider>
  );
}
