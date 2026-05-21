# Theorise — Known Issues

> Sections §1–§21 are tracked on the `contracts` feature branches and will
> reconcile here when those PRs land. §22 below ships with the v1 UI branch
> because it codifies the platform's framing — a transparency platform, not
> a custody platform — which the landing page and README now reflect directly.

---

## §22. Risk laundering and depositor risk acceptance

**Status:** Accepted design trade-off. Not a vulnerability.

Creators on Theorise have asymmetric trading exposure relative to depositors. With the contract-enforced 5% minimum stake floor, a creator absorbs only 5% of any loss while controlling 100% of trading decisions. A creator could route risky directional bets through the vault that they wouldn't take with 100% of their own capital, knowing depositors absorb 95% of any loss.

The platform does not consider this a vulnerability. It is a structural property of any pooled-capital trading platform with a minority creator stake. The mitigations are:

1. **5% minimum stake floor** with 48-hour cure window — bounds asymmetry, ensures creators have meaningful skin-in-game
2. **Performance fee on realized gains only** (excludes unrealized perp PnL) — prevents NAV-manipulation-based fee extraction
3. **No admin-burn, admin-transfer, or sweep functions** — creator cannot directly drain vault assets to themselves
4. **All trading visible on-chain** — every position, every fill, every NAV change is auditable
5. **Builder fee revenue accrues to platform**, not creator — eliminates trading-fee-based extraction vectors
6. **Counterparty diversity scoring (post-MVP)** — planned Creator Verification feature surfaces coordinated trading patterns to depositors

Self-dealing wash trading (creator's personal account placing off-mid orders that the vault fills) is mechanically possible on thin-book markets but generally unprofitable due to position-unwind costs. The wash trade transfers capital from personal account to vault (or vice versa) at a manipulated price, but the resulting position must be unwound at market, which reverses the transfer. Performance-fee extraction via wash-induced realized gains is bounded by the gain × fee rate × (1 − creator's stake share), which is small relative to the wash trade cost.

**Theorise is a transparency platform, not a custody platform.** Creator trading decisions are not constrained beyond the stake floor. Depositors are expected to evaluate creator track record, stated strategy, and on-chain behavior before committing capital. The platform's role is to ensure this evaluation is possible through verifiable data, not to prevent any specific creator behavior. This is intentional.

**Audit guidance:** The audit should not flag "creator can lose depositor capital through trading" as a vulnerability. The audit should verify:
- The 5% floor is correctly enforced
- The cure window correctly pauses trading after 48h
- Performance fees correctly compute on realized gains only
- No admin functions allow direct asset extraction
- Builder fees are routed to platform treasury, not creator
