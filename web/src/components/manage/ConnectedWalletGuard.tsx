"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";

type ConnectedWalletGuardProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function ConnectedWalletGuard({
  children,
  title = "Connect your wallet",
  description = "Connect a wallet to view this page.",
}: ConnectedWalletGuardProps) {
  return (
    <RKConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted, authenticationStatus }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && Boolean(account) && Boolean(chain);

        if (!connected) {
          return (
            <div className="max-w-[640px] mx-auto px-6 py-16">
              <div className="rounded-lg border border-line bg-surface p-8 text-center space-y-4">
                <h2 className="text-heading-lg">{title}</h2>
                <p className="text-[14px] text-ink-2 leading-relaxed max-w-md mx-auto">
                  {description}
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
