export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-ink">
      <section className="max-w-[1400px] mx-auto px-6 py-16 space-y-12">
        <div className="space-y-3">
          <span className="text-label">v1 · preview</span>
          <h1 className="text-display-lg max-w-2xl">
            Back creators, not coins.
          </h1>
          <p className="text-ink-2 max-w-prose text-[15px]">
            Theorise turns conviction in a creator into a tradable position.
            Every vault is on Hyperliquid, every fill is on-chain, and every
            creator has skin in the game.
          </p>
        </div>

        <div className="space-y-1">
          <div className="text-label">Tabular numerics test</div>
          <div className="num text-display-md">1234567890</div>
          <div className="num text-display-md">0987654321</div>
        </div>
      </section>
    </main>
  );
}
