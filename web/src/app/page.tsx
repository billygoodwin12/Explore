import { LineChart, ShieldCheck, Users } from "lucide-react";

import { ConnectCta } from "@/components/home/ConnectCta";
import { FindAVault } from "@/components/home/FindAVault";
import { SectionDivider } from "@/components/home/SectionDivider";

const STEPS = [
  {
    icon: Users,
    title: "Become a creator",
    body: "Deploy a vault, post ≥ $100 of stake, and start sharing your edge. Your stake is locked alongside depositors’ until you wind down — that’s skin in the game.",
  },
  {
    icon: LineChart,
    title: "Follow a creator",
    body: "Pick a vault, deposit USDC, and your shares track the creator’s on-chain P&L. Every fill and every fee is visible on Hyperscan.",
  },
  {
    icon: ShieldCheck,
    title: "Withdraw anytime",
    body: "Burn shares for proportional USDC at the live NAV. No lockups, no notice periods, no off-chain promises.",
  },
];

export default function HomePage() {
  return (
    <main className="bg-bg text-ink">
      <section className="max-w-[640px] mx-auto px-6 pt-24 pb-16 space-y-8">
        <h1 className="text-display-lg">Trade like the people you trust.</h1>
        <p className="text-ink-2 text-[16px] leading-relaxed">
          Theorise is a creator-vault platform on Hyperliquid. Every trade is
          verifiable on-chain. Every creator must keep at least{" "}
          <span className="font-medium text-ink">5% of their vault’s value</span>{" "}
          as their own stake. We show you everything. You decide who’s worth
          following.
        </p>
        <ConnectCta />
      </section>

      <section className="max-w-[1100px] mx-auto px-6 space-y-10">
        <SectionDivider label="How it works" id="how-it-works" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              className="rounded-lg border border-line bg-surface p-6 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="text-label num">0{i + 1}</span>
              </div>
              <h3 className="text-heading-md">{title}</h3>
              <p className="text-[13px] text-ink-2 leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-[640px] mx-auto px-6 mt-16 mb-24 space-y-6">
        <SectionDivider label="Find a vault" id="find-a-vault" />
        <p className="text-[13px] text-ink-2 leading-relaxed">
          Know the creator? Paste their{" "}
          <span className="num text-ink">@handle</span> or the{" "}
          <span className="num text-ink">0x…</span> vault address.
        </p>
        <FindAVault />
      </section>
    </main>
  );
}
