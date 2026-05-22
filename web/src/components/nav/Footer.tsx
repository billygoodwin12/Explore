import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getChainById, hyperliquidTestnet } from "@/lib/chain/hyperliquid";
import { expectedChainId } from "@/lib/chain/switchChain";
import { shortenAddress } from "@/lib/formatting/address";

const GITHUB_URL = "https://github.com/billygoodwin12/Explore";
const USDC_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS ??
  "0x0000000000000000000000000000000000000000";

function AddressRow({
  label,
  address,
  explorer,
  pending,
}: {
  label: string;
  address: string;
  explorer: string;
  pending?: boolean;
}) {
  if (pending) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-2">{label}</span>
        <span className="num text-ink-3">TBD</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-2">{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-ink hover:text-brand transition-colors"
          >
            {shortenAddress(address, 4)}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="font-mono text-[11px]">
          {address}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Footer() {
  const chain = getChainById(expectedChainId()) ?? hyperliquidTestnet;
  const explorer = chain.blockExplorers.default.url;
  const factoryPending =
    FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000";

  return (
    <footer className="border-t border-line bg-surface mt-16">
      <div className="max-w-[1400px] mx-auto px-6 py-8 grid grid-cols-1 sm:grid-cols-3 gap-8 text-[12px]">
        <div className="space-y-3">
          <div className="text-label">Contracts</div>
          <div className="space-y-1.5">
            <AddressRow
              label="Factory"
              address={FACTORY_ADDRESS}
              explorer={explorer}
              pending={factoryPending}
            />
            <AddressRow
              label="USDC"
              address={USDC_ADDRESS}
              explorer={explorer}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-label">Resources</div>
          <div className="space-y-1.5">
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-ink hover:text-brand transition-colors"
            >
              GitHub →
            </Link>
            <Link
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-ink hover:text-brand transition-colors"
            >
              Hyperscan ({chain.testnet ? "testnet" : "mainnet"}) →
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-label">Theorise</div>
          <div className="text-ink-2 space-y-1">
            <div>v0.1 · preview</div>
            <div>{chain.name}</div>
            <div className="num">chain {chain.id}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
