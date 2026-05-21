import { ConnectButton } from "@rainbow-me/rainbowkit";

import { Wordmark } from "@/components/primitives/Wordmark";
import { WrongChainBanner } from "@/components/primitives/WrongChainBanner";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg text-ink">
      <nav className="border-b border-line px-6 py-4 flex items-center justify-between">
        <Wordmark as="a" size="nav" />
        <ConnectButton showBalance={false} chainStatus="icon" />
      </nav>
      <WrongChainBanner />

      <section className="px-6 py-16 space-y-12">
        <Wordmark size="hero" as="h1" />

        <div className="space-y-6">
          <div className="space-y-1">
            <div className="text-label">Tabular numerics test</div>
            <div className="num text-display-md">1234567890</div>
            <div className="num text-display-md">0987654321</div>
          </div>

          <div className="space-y-1">
            <div className="text-label">Sentiment</div>
            <div className="flex gap-6">
              <span className="num text-heading-lg text-positive">+12.34%</span>
              <span className="num text-heading-lg text-negative">-5.67%</span>
              <span className="num text-heading-lg text-accent">$1,234.56</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-label">Type ramp</div>
            <div className="text-display-lg">Display lg</div>
            <div className="text-display-md">Display md</div>
            <div className="text-heading-lg">Heading lg</div>
            <div className="text-heading-md">Heading md</div>
            <div>Body 14px regular</div>
          </div>
        </div>
      </section>
    </main>
  );
}
