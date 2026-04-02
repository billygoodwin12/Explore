'use client';

import React from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/lib/wallet/config';

import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const hasWalletConnect = !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!hasWalletConnect) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#1B2A3D',
            accentColorForeground: '#ffffff',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
