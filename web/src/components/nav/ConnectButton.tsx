"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";

import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/lib/formatting/address";

export function ConnectButton() {
  return (
    <RKConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <Button
              variant="primary-dark"
              size="compact"
              onClick={openConnectModal}
              disabled={!ready}
            >
              Connect
            </Button>
          );
        }

        if (chain.unsupported) {
          return (
            <Button variant="destructive" size="compact" onClick={openChainModal}>
              Wrong network
            </Button>
          );
        }

        const label = account.ensName ?? shortenAddress(account.address, 4);

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="flex items-center gap-2 h-7 pl-1 pr-3 rounded-full border border-line bg-surface hover:bg-surface-2 transition-colors text-[12px] font-medium text-ink"
          >
            {account.ensAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.ensAvatar}
                alt=""
                className="size-5 rounded-full"
              />
            ) : (
              <span
                className="size-5 rounded-full border border-line"
                style={{
                  background: `conic-gradient(from ${
                    (parseInt(account.address.slice(2, 8), 16) % 360)
                  }deg, rgb(243,159,65), rgb(72,207,174), rgb(243,159,65))`,
                }}
                aria-hidden
              />
            )}
            <span className="font-mono">@{label}</span>
          </button>
        );
      }}
    </RKConnectButton.Custom>
  );
}
