"use client";

import { AlertTriangle, ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getChainById, hyperliquidTestnet } from "@/lib/chain/hyperliquid";
import { expectedChainId } from "@/lib/chain/switchChain";
import { shortenAddress } from "@/lib/formatting/address";
import { formatRelative } from "@/lib/formatting/time";
import { useCurrentUserVault } from "@/lib/hooks/useCurrentUserVault";
import { useHydrated } from "@/lib/hooks/useHydrated";
import {
  usePreferencesStore,
  type PnlUnit,
} from "@/lib/store/preferences";
import { cn } from "@/lib/utils";

export function SettingsForm() {
  return (
    <main className="max-w-[760px] mx-auto px-6 py-10 space-y-8">
      <header className="space-y-1">
        <span className="text-label">Settings</span>
        <h1 className="text-heading-lg">Preferences</h1>
        <p className="text-[13px] text-ink-2">
          Saved locally to this browser. Tied to the wallet you connect with.
        </p>
      </header>

      <DisplaySection />
      <NotificationsSection />
      <GuardrailsSection />
      <WalletSection />
      <AccountSection />
    </main>
  );
}

function Section({
  title,
  description,
  children,
  badge,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-ink">{title}</h2>
          {description ? (
            <p className="text-[12px] text-ink-2 mt-0.5 leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {badge}
      </header>
      <div className="px-5 py-3 divide-y divide-line">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-2 last:pb-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {description ? (
          <p className="text-[12px] text-ink-2 mt-0.5 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* ───────────────────────── Display ───────────────────────── */

const PNL_OPTIONS: Array<{ value: PnlUnit; label: string; aria: string }> = [
  { value: "percent", label: "%", aria: "Percent" },
  { value: "dollars", label: "$", aria: "Dollars" },
  { value: "hidden", label: "Hide", aria: "Hidden" },
];

function DisplaySection() {
  const hydrated = useHydrated();
  const pnlUnit = usePreferencesStore((s) => s.pnlUnit);
  const showCostBasis = usePreferencesStore((s) => s.showCostBasis);
  const showLivePnlChipsInNav = usePreferencesStore(
    (s) => s.showLivePnlChipsInNav,
  );
  const setPnlUnit = usePreferencesStore((s) => s.setPnlUnit);
  const setShowCostBasis = usePreferencesStore((s) => s.setShowCostBasis);
  const setShowLivePnlChipsInNav = usePreferencesStore(
    (s) => s.setShowLivePnlChipsInNav,
  );

  return (
    <Section
      title="Display"
      description="How values render across the dashboard, holdings, and nav."
    >
      <Row
        label="P&L unit"
        description="How performance numbers render in stat cards and holdings rows."
        control={
          <div
            role="radiogroup"
            aria-label="P&L unit"
            className="inline-flex rounded-full border border-line bg-surface p-0.5"
          >
            {PNL_OPTIONS.map((opt) => {
              const active = hydrated && pnlUnit === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={opt.aria}
                  onClick={() => setPnlUnit(opt.value)}
                  className={cn(
                    "h-7 min-w-10 px-3 text-[12px] font-medium rounded-full transition-colors num",
                    active
                      ? "bg-ink text-bg"
                      : "text-ink-2 hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        }
      />
      <Row
        label="Show cost basis"
        description="Add a cost-basis column to your holdings table. Default off for privacy."
        control={
          <Switch
            checked={hydrated && showCostBasis}
            onCheckedChange={setShowCostBasis}
            aria-label="Show cost basis"
          />
        }
      />
      <Row
        label="Live P&L chips in nav"
        description="Show your running 24h P&L as a chip next to the wordmark."
        control={
          <Switch
            checked={hydrated && showLivePnlChipsInNav}
            onCheckedChange={setShowLivePnlChipsInNav}
            aria-label="Live P&L chips in nav"
          />
        }
      />
    </Section>
  );
}

/* ─────────────────────── Notifications ────────────────────── */

function NotificationsSection() {
  const hydrated = useHydrated();
  const dep = usePreferencesStore((s) => s.notifyDepositConfirmations);
  const wdr = usePreferencesStore((s) => s.notifyWithdrawConfirmations);
  const trades = usePreferencesStore((s) => s.notifyCreatorTrades);
  const setDep = usePreferencesStore((s) => s.setNotifyDepositConfirmations);
  const setWdr = usePreferencesStore((s) => s.setNotifyWithdrawConfirmations);
  const setTrades = usePreferencesStore((s) => s.setNotifyCreatorTrades);

  return (
    <Section
      title="Notifications"
      description="What you'd like to hear about, once delivery ships."
      badge={
        <span className="inline-flex items-center rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-2">
          Phase 2
        </span>
      }
    >
      <div className="pt-2 pb-3 -mx-5 px-5 -mt-1 mb-2 border-b border-line bg-surface-2/40">
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Preferences saved now. Delivery (push, email, in-app) lands in a
          later phase. Toggling these today only records your choice.
        </p>
      </div>
      <Row
        label="Deposit confirmations"
        description="Notify me when a deposit I made confirms on-chain."
        control={
          <Switch
            checked={hydrated && dep}
            onCheckedChange={setDep}
            aria-label="Deposit confirmations"
          />
        }
      />
      <Row
        label="Withdraw confirmations"
        description="Notify me when a withdrawal I made confirms on-chain."
        control={
          <Switch
            checked={hydrated && wdr}
            onCheckedChange={setWdr}
            aria-label="Withdraw confirmations"
          />
        }
      />
      <Row
        label="Creator placed a trade"
        description="Notify me when a creator I follow opens or closes a position."
        control={
          <Switch
            checked={hydrated && trades}
            onCheckedChange={setTrades}
            aria-label="Creator placed a trade"
          />
        }
      />
    </Section>
  );
}

/* ──────────────────── Trading guardrails ──────────────────── */

function GuardrailsSection() {
  const hydrated = useHydrated();
  const enabled = usePreferencesStore((s) => s.dailyLossCircuitBreakerEnabled);
  const pct = usePreferencesStore((s) => s.dailyLossCircuitBreakerPct);
  const setEnabled = usePreferencesStore(
    (s) => s.setDailyLossCircuitBreakerEnabled,
  );
  const setPct = usePreferencesStore((s) => s.setDailyLossCircuitBreakerPct);

  return (
    <Section
      title="Trading guardrails"
      description="Self-imposed limits applied client-side. Not enforced on-chain."
    >
      <Row
        label="Daily-loss circuit breaker"
        description="Block new deposits for 24h once your portfolio drops by the threshold below."
        control={
          <Switch
            checked={hydrated && enabled}
            onCheckedChange={setEnabled}
            aria-label="Daily-loss circuit breaker"
          />
        }
      />
      <Row
        label="Threshold"
        description="Percent of total portfolio value, applied on a rolling 24-hour window."
        control={
          <div className="relative">
            <Input
              value={hydrated ? String(pct) : ""}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                if (v === "") return;
                setPct(Number(v));
              }}
              disabled={!hydrated || !enabled}
              inputMode="numeric"
              className="font-mono text-[14px] h-8 w-24 pr-8 text-right"
              aria-label="Daily loss threshold percent"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-3 num pointer-events-none">
              %
            </span>
          </div>
        }
      />
      {hydrated && enabled ? (
        <div className="py-3 -mx-5 px-5 border-l-2 border-warning bg-warning/5 mt-2">
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="size-3.5 text-warning shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <p className="text-[11px] text-ink-2 leading-relaxed">
              Circuit breaker engages at <span className="num text-ink">−{pct}%</span>{" "}
              over 24h. The platform can't stop the underlying perp positions —
              the breaker only blocks new deposits.
            </p>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

/* ─────────────────────────── Wallet ───────────────────────── */

function WalletSection() {
  const { address, connector } = useAccount();
  const { disconnect } = useDisconnect();

  if (!address) return null;

  return (
    <Section
      title="Wallet"
      description="The wallet currently connected to Theorise."
    >
      <Row
        label="Connected address"
        description={connector?.name ? `Via ${connector.name}` : undefined}
        control={
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="num text-[13px] text-ink bg-surface-2 rounded-full border border-line px-3 py-1 cursor-default">
                {shortenAddress(address, 6)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-[11px]">
              {address}
            </TooltipContent>
          </Tooltip>
        }
      />
      <Row
        label="Disconnect"
        description="Sign out and clear the wallet connection."
        control={
          <Button variant="destructive" size="default" onClick={() => disconnect()}>
            <LogOut />
            Disconnect
          </Button>
        }
      />
    </Section>
  );
}

/* ─────────────────────────── Account ──────────────────────── */

function AccountSection() {
  const { data: vault } = useCurrentUserVault();
  const chain = getChainById(expectedChainId()) ?? hyperliquidTestnet;
  const explorer = chain.blockExplorers.default.url;

  if (!vault) {
    return (
      <Section
        title="Account"
        description="Your vault on Theorise."
      >
        <div className="py-4 text-center space-y-3">
          <p className="text-[13px] text-ink-2">
            You haven't deployed a vault yet.
          </p>
          <Button asChild variant="primary" size="default">
            <Link href="/onboarding">Become a creator →</Link>
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Account" description="Your deployed vault.">
      <Row
        label="Vault contract"
        description={`@${vault.handle} on ${chain.name}`}
        control={
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`${explorer}/address/${vault.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="num text-[13px] text-ink bg-surface-2 rounded-full border border-line px-3 py-1 inline-flex items-center gap-1.5 hover:text-brand transition-colors"
              >
                {shortenAddress(vault.id, 6)}
                <ExternalLink className="size-3" strokeWidth={2} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-[11px]">
              {vault.id}
            </TooltipContent>
          </Tooltip>
        }
      />
      <Row
        label="Deployed"
        description={new Date(vault.joinedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        control={
          <span className="num text-[12px] text-ink-3">
            {formatRelative(vault.joinedAt)}
          </span>
        }
      />
    </Section>
  );
}
