"use client";

import { useAccount, useConfig } from "wagmi";

import { getChainById } from "@/lib/chain/hyperliquid";
import {
  expectedChainId,
  isWrongChain,
  switchToExpectedChain,
} from "@/lib/chain/switchChain";

export function WrongChainBanner() {
  const config = useConfig();
  const { chainId, isConnected } = useAccount();

  if (!isConnected) return null;
  if (!isWrongChain(chainId)) return null;

  const target = getChainById(expectedChainId());

  return (
    <div className="border-b border-line bg-brand-soft px-6 py-3 flex items-center justify-between">
      <div className="text-[13px] text-ink">
        Wrong network. Switch to <span className="font-medium">{target?.name ?? "Hyperliquid"}</span> to continue.
      </div>
      <button
        type="button"
        onClick={() => void switchToExpectedChain(config)}
        className="text-[13px] font-medium text-ink underline underline-offset-2 hover:text-brand"
      >
        Switch network
      </button>
    </div>
  );
}
