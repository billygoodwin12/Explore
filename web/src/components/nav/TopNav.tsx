"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChainId } from "wagmi";

import { ConnectButton } from "@/components/nav/ConnectButton";
import { SearchBar } from "@/components/nav/SearchBar";
import { Wordmark } from "@/components/primitives/Wordmark";
import { hyperliquidTestnet } from "@/lib/chain/hyperliquid";
import { expectedChainId } from "@/lib/chain/switchChain";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/manage", label: "Manage" },
  { href: "/portfolio", label: "Portfolio" },
];

function isActiveTab(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const chainId = useChainId();
  const isTestnet =
    chainId === hyperliquidTestnet.id ||
    expectedChainId() === hyperliquidTestnet.id;

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 bg-surface border-b border-line">
      <div className="mx-auto flex h-full items-center gap-3 px-4 sm:px-6 max-w-[1400px]">
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="Theorise home"
        >
          <Wordmark size="nav" />
          {isTestnet ? (
            <span className="text-[10px] font-medium tracking-[0.08em] uppercase bg-surface-2 text-ink-2 px-1.5 py-0.5 rounded-sm border border-line">
              testnet
            </span>
          ) : null}
        </Link>

        <nav
          className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Primary"
        >
          <ul className="flex items-center gap-1 h-14 min-w-max">
            {TABS.map((tab) => {
              const active = isActiveTab(pathname, tab.href);
              return (
                <li key={tab.href} className="h-full">
                  <Link
                    href={tab.href}
                    className={cn(
                      "relative inline-flex items-center h-full px-4 text-[14px] font-medium transition-colors",
                      active ? "text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {tab.label}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-3 right-3 bottom-0 h-[3px] rounded-t-sm bg-positive transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <SearchBar />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
