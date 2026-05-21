# Theorise

## What Theorise is

Theorise is a creator-vault platform on Hyperliquid. Creators deploy ERC-4626 vaults backed by USDC on HyperCore. Depositors buy share tokens to gain pro-rata exposure to the creator's HL perp trading.

## What Theorise promises

**Verifiable on-chain history.** Every trade, every position, every fee is visible on-chain. The track record cannot be falsified.

**Contract-enforced creator stake.** Every vault must hold at least 5% of its value as creator stake. If the creator's stake falls below 5%, they have 48 hours to top up or trading pauses automatically. This is enforced by the smart contract, not by trust.

**Transparent fee mechanics.** Deposit fees split 80/20 between creator and platform. Performance fees split 90/10. All fees visible at deposit and withdrawal time. No hidden charges.

**No custody, no KYC, no platform discretion.** Funds are held in the creator's vault, custodied by the contract. The platform cannot freeze, seize, redirect, or modify deposits. Withdrawals are always available regardless of platform state.

## What Theorise does not promise

**Loss protection.** Creators trade their strategy. If a creator takes a losing trade, the vault loses money. Depositors lose money pro-rata. The platform does not constrain creator trading decisions beyond the stake floor.

**Strategy curation.** Theorise does not pick winners or vet strategies. Any wallet that meets the $100 minimum stake can deploy a vault. Bad strategies and good strategies coexist on the platform. Depositors evaluate based on on-chain data.

**Performance guarantees.** Track record is past behavior, not future returns. Creators can change strategies, take outsized risks, or simply lose touch with markets. Depositors should evaluate ongoing trading behavior, not just historical performance.

## How to use Theorise

If you're considering depositing into a creator's vault, evaluate:

- **Track record length.** A 6-day track record means nothing. A 6-month track record is suggestive. A 2-year track record across multiple market regimes is meaningful.
- **Drawdown behavior.** How did the creator handle past losses? Did they recover, double down, or rage-trade?
- **Strategy clarity.** Does the creator's stated strategy match their actual trades?
- **Wallet history (if available).** Some creators opt in to displaying their personal HL trading history alongside their vault. This is a credibility signal.
- **Position transparency.** Creators with consistently disclosed positions (rather than rapid in-and-out flips) are more legible to depositors.

Then decide what you're comfortable risking. Theorise gives you the data. The decision is yours.

---

## Repository layout

- `web/` — Next.js 15 + Tailwind v4 + RainbowKit frontend (this branch, `feat/v1-ui`).
- `contracts/` — Foundry workspace with the ERC-4626 vault, factory, and timelocked admin. Tracked on the contracts feature branches; build artifacts are gitignored on this branch.

See `KNOWN_ISSUES.md` for accepted design trade-offs and audit guidance.
