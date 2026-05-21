import { ArrowRight, LineChart, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const POINTS = [
  {
    icon: Users,
    title: "Build a following",
    body: "Depositors discover you through the leaderboard, follow feeds, and shared links.",
  },
  {
    icon: LineChart,
    title: "Earn on AUM and gains",
    body: "Set your own deposit fee (up to 100 bps) and performance fee (up to 2000 bps).",
  },
  {
    icon: ShieldCheck,
    title: "Skin in the game",
    body: "Your stake is locked alongside depositors’ — a $100 minimum to deploy, 5% floor to stay live.",
  },
];

export function BecomeCreatorUpsell() {
  return (
    <main className="max-w-[760px] mx-auto px-6 py-16 space-y-8">
      <header className="space-y-3">
        <span className="text-label">Become a creator</span>
        <h1 className="text-display-md">Deploy a vault in three steps</h1>
        <p className="text-[15px] text-ink-2 leading-relaxed max-w-prose">
          You don’t have a vault yet. Spin one up — depositors back your edge,
          you keep most of the fees, and everything settles on-chain on
          Hyperliquid.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button asChild variant="primary" size="lg">
            <Link href="/onboarding">
              Start onboarding
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">Read how it works →</Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-lg border border-line bg-surface p-5 space-y-2"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <h3 className="text-[14px] font-medium text-ink">{title}</h3>
            <p className="text-[12px] text-ink-2 leading-relaxed">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
