"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ConnectCta() {
  return (
    <RKConnectButton.Custom>
      {({ account, chain, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain;

        return (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {connected ? (
              <Button asChild variant="primary" size="lg">
                <Link href="/portfolio">
                  Go to Portfolio
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={openConnectModal}
                disabled={!ready}
              >
                Connect wallet to start
                <ArrowRight />
              </Button>
            )}
            <Link
              href="/manage"
              className="inline-flex items-center gap-1 text-[14px] text-ink-2 hover:text-ink transition-colors px-2"
            >
              Browse a creator →
            </Link>
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
