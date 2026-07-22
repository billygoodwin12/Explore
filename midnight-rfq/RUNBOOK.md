# Midnight RFQ — Operator Runbook

A proof-of-concept RFQ platform for **Morpho Midnight** (fixed-rate, fixed-term lending) on **Base Sepolia**, demonstrable end-to-end by one person playing both **maker** and **taker** from two wallet accounts.

## Deployed addresses

> **Status:** the addresses below come from the repo's **local anvil rehearsal** of the deploy
> script (chain id 84532, deterministic anvil deployer). The build environment could not reach
> `https://sepolia.base.org`, so the public-testnet broadcast is the one step left for the
> operator: run step 5 below with a funded key, then `pnpm gen` — every address in the app,
> server, and this file's source (`contracts/deployments/base-sepolia.json`) refreshes from that
> single deploy. Nothing else needs editing.

| Contract | Address |
|---|---|
| Midnight (singleton) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| EcrecoverRatifier | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| HashHelper | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| mUSDC (6 dec) | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| mDAI (18 dec) | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` |
| mWETH (18 dec) | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |
| mWBTC (8 dec) | `0x0165878A594ca255338adfa4d48449f69242Eb8F` |

Markets (id → pair): see `contracts/deployments/base-sepolia.json` — 4 markets:
mWETH/mUSDC (LLTV 0.86) · mWBTC/mUSDC (0.77) · mWETH/mDAI (0.86) · mWBTC/mDAI (0.77),
all with liquidation cursor 0.3, maturity = deploy + 30 days, ungated.

## One-time setup

1. Install: Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`), Node ≥ 20, pnpm.
2. Two wallet accounts in MetaMask: **Desk A** (maker) and **Desk B** (taker). Add Base Sepolia
   (chainId 84532, RPC `https://sepolia.base.org`, explorer `https://sepolia.basescan.org`).
3. Fund BOTH accounts with Base Sepolia ETH: Coinbase CDP faucet
   (`portal.cdp.coinbase.com/products/faucet`) or Alchemy Base Sepolia faucet. ~0.2 ETH each is ample.
4. `contracts/.env`: `PRIVATE_KEY=0x...` (a THIRD throwaway key, the deployer/configurator — fund
   it too). Never a mainnet key.
5. Deploy: `cd contracts && source .env && forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast -vvv`.
   Then from the repo root: `pnpm install && pnpm gen` (regenerates `shared/deployments.ts`).
6. Start: `pnpm --dir server dev` (port 8787), `pnpm --dir web dev` (port 5173).
7. Optional: put Desk A/B addresses in `web/.env` as `VITE_DESK_A` / `VITE_DESK_B` to get the
   "Desk A — Maker" / "Desk B — Taker" role chips in the header.

### Local rehearsal (no testnet needed)

```bash
anvil --chain-id 84532 &
cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd .. && pnpm gen
RPC_URL=http://127.0.0.1:8545 pnpm --dir server dev &
VITE_RPC_URL=http://127.0.0.1:8545 pnpm --dir web dev
# optional: seed the book with a signed lend quote from anvil account #1
pnpm tsx scripts/seed-demo-offer.ts
```

## Demo script (≈10 minutes)

**Act 0 — funding.** Connect Desk A → Faucet → Mint demo set. Switch to Desk B → same.

**Act 1 — maker posts a lend quote (Desk A).** Select mWETH / mUSDC. Make tab → Lend → size
10,000 mUSDC, rate 5.00%, expiry +7d. Run the checklist: authorize ratifier (tx), approve mUSDC
(tx). Verify digest (both hashes match on screen). Sign (MetaMask shows the full typed Offer —
this is clear-signing, point it out). Post. Quote appears in the book at its executable APR.

**Act 2 — taker borrows (Desk B).** Switch account. Quotes tab → the lend quote → Take → units
5,000 mUSDC-equivalent. Modal computes required mWETH collateral (~2.9 mWETH at $2,500, LLTV 0.86,
HF 1.25). Approve mWETH → Supply collateral → Take. Show the result: Desk B wallet +~4,975 mUSDC
(5,000 × price ≈ 0.995); Position tab shows debt 5,000, collateral locked. Switch to Desk A
Position: credit 5,000. Emphasize: A's mUSDC moved directly to B in B's transaction; the offer had
locked nothing.

**Act 3 — the other direction (borrow request).** Desk B → Make → Borrow → size 2,000 mUSDC at 6%
(collateral checklist already satisfied). Sign, post. Desk A → Take it (approve mUSDC happens
in-modal). Now show B's debt = 7,000, A's credit = 7,000.

**Act 4 — unwind without waiting 30 days.** Desk B → Position → Repay 7,000 (approve + repay).
Market `withdrawable` jumps to 7,000. Withdraw all collateral. Desk A → Withdraw credit 7,000 →
mUSDC back in wallet. Net: A earned nothing yet — full yield accrues only at maturity; A's P&L
here = 7,000 − (sum of discounted amounts paid) — read the exact figures off the wallet balances
and state that this delta IS the fixed rate, realized early because the borrower prepaid at par.

**Act 5 (optional) — cancel.** Post another quote from A, cancel it (`cancelRoot` tx), show the
server marks it cancelled and takes on it revert.

## Troubleshooting

| Revert / symptom | Cause | Fix |
|---|---|---|
| `RatifierUnauthorized` | maker never called `setIsAuthorized(ratifier, true, maker)` | Make tab checklist |
| `RatifierFailed` / `InvalidProof` | TS hashing drifted from HashLib | `assertDigestParity` before signing; re-run the Foundry E2E gate |
| `RootCanceled` | maker cancelled this root on-chain | post a new offer |
| `SelfTake` | same wallet on both sides | switch account |
| `SellerIsLiquidatable` | borrower's collateral insufficient post-trade | supply more collateral first |
| `ConsumedUnits` | fill exceeds remaining group budget | re-read `consumed`, lower units |
| `TickNotAccessible` | tick not multiple of live `tickSpacing` | always derive tick via `priceToTick(price, tickSpacing)` |
| `InvalidOfferCaps` | both or neither of maxUnits/maxAssets zero | schema validation |
| `UnusedReceiverMustBeZero` | receiver rules violated | direction-aware receiver logic |
| ERC20 revert inside take on buy-offer | MAKER lacks balance/allowance (payer = maker!) | maker-underfunded flag in book |
| `ContinuousFeeAboveOfferCap` | cap set below market fee | cap = 1e18 constant |
| `InvalidChainId` / `InvalidMidnight` | market struct built with wrong chainId/midnight | always source from deployments.ts |
| withdraw reverts (underflow) | `withdrawable` < units — no one repaid yet | repay first; cap input at withdrawable |
| deploy hits `invalid opcode` | RPC node pre-Osaka | set `evm_version = "cancun"` in `contracts/foundry.toml`, redeploy |

Plus: if MetaMask hides the typed-data details, expand "Message"; if txs hang, Base Sepolia
occasionally reorders — speed up with +10% gas; if the book looks stale, the 5s poll will catch up
or hard-refresh.
