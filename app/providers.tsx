"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  wagmiAdapter,
  solanaAdapter,
  projectId,
  networks,
  metadata,
} from "@/lib/appkit-config";

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not set");
}

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  projectId,
  networks,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: "light",
});

const queryClient = new QueryClient();

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: Parameters<typeof WagmiProvider>[0]["initialState"];
}) {
  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
