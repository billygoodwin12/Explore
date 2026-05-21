"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";

export function ConnectedWalletGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RKConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted, authenticationStatus }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && Boolean(account) && Boolean(chain);

        if (!connected) {
          return (
            <div className="max-w-[640px] mx-auto px-6 py-16">
              <div className="rounded-lg border border-line bg-surface p-8 text-center space-y-4">
                <h2 className="text-heading-lg">Connect your wallet</h2>
                <p className="text-[14px] text-ink-2 leading-relaxed max-w-md mx-auto">
                  This page is for creators. Connect the wallet that controls
                  your vault to manage stake, fees, and view your open
                  positions.
                </p>
                <Button
                  variant="primary-dark"
                  size="default"
                  onClick={openConnectModal}
                  disabled={!ready}
                >
                  Connect wallet
                </Button>
              </div>
            </div>
          );
        }

        return <>{children}</>;
      }}
    </RKConnectButton.Custom>
  );
}
