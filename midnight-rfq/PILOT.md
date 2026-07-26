# Midnight RFQ — Two-Screen Pilot Guide

Goal: run the platform live on Base Sepolia with **Desk A (maker)** on one screen and
**Desk B (taker)** on the other, and follow every trade on a block explorer with fully
decoded events.

Everything runs on one computer:

```
┌─ Screen 1 ─────────────────────┐   ┌─ Screen 2 ─────────────────────┐
│ Browser profile "Desk A"       │   │ Browser profile "Desk B"       │
│  MetaMask #1 (maker key)       │   │  MetaMask #2 (taker key)       │
│  localhost:5173  ← same app →  │   │  localhost:5173                │
│  sepolia.basescan.org          │   │  sepolia.basescan.org          │
└────────────────────────────────┘   └────────────────────────────────┘
            │                                   │
            └────────── localhost:8787 (RFQ server) ──────────┘
                        Base Sepolia RPC (sepolia.base.org)
```

## 1. Two wallet setups — use two browser *profiles*, not two accounts

One MetaMask switching between two accounts breaks the side-by-side demo: both windows
share the same connected account. Instead:

1. Chrome (or Brave/Edge): **⋮ → Add profile** → name it `Desk A`. Repeat for `Desk B`.
   Each profile gets its own extension store — install MetaMask separately in each.
2. In each MetaMask, create (or import) a **fresh throwaway key**. Never reuse anything
   that has ever touched mainnet funds.
3. Add Base Sepolia to both (MetaMask usually offers it under test networks; otherwise
   add manually: chainId `84532`, RPC `https://sepolia.base.org`, currency ETH,
   explorer `https://sepolia.basescan.org`).
4. Fund **both** accounts (~0.2 ETH each) plus a **third deployer key** via the
   Coinbase CDP faucet (`portal.cdp.coinbase.com/products/faucet`) or Alchemy's
   Base Sepolia faucet.
5. Put the two addresses in `web/.env` so the header shows the role chips:

   ```
   VITE_DESK_A=0x...maker
   VITE_DESK_B=0x...taker
   ```

Drag one profile window to each screen. Keep a Basescan tab open in each — on Desk A's
screen watch the **maker address** page, on Desk B's the **taker address** page; every
new tx appears there instantly.

## 2. Deploy WITH source verification (this is what makes the explorer readable)

Without verification, Basescan shows your takes as raw hex logs. Verify at deploy time
and every transaction decodes into named events (`Take`, `SupplyCollateral`, `Repay`,
`Withdraw`, `SetIsAuthorized`) with readable arguments.

```bash
cd contracts
cp .env.example .env   # or create: PRIVATE_KEY=0x...deployer key
source .env
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast -vvv \
  --verify --etherscan-api-key $ETHERSCAN_API_KEY
```

- The API key is a free **Etherscan** account key (Etherscan v2 covers Base Sepolia;
  no separate Basescan key needed anymore).
- No Etherscan account? Verify on **Blockscout** instead — no key required:

  ```bash
  forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast -vvv \
    --verify --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api
  ```

  Then point the UI's explorer links there: `VITE_EXPLORER_URL=https://base-sepolia.blockscout.com`
  in `web/.env`.
- Forgot `--verify` at deploy time? Verify after the fact per contract:
  `forge verify-contract --chain 84532 <address> src/HashHelper.sol:HashHelper --etherscan-api-key $ETHERSCAN_API_KEY`
  (same for `lib/midnight/src/Midnight.sol:Midnight`, the ratifier, mocks — pass
  `--constructor-args` where the constructor takes them, e.g. the ratifier takes the
  Midnight address).

Then regenerate the app bindings and start the stack:

```bash
cd .. && pnpm install && pnpm gen
pnpm dev:server     # :8787
pnpm dev:web        # :5173
```

Open `localhost:5173` in **both** profiles, connect each wallet, and confirm the header
chips read "Desk A — Maker" and "Desk B — Taker".

## 3. The pilot run — what to check on the explorer at each act

Follow the RUNBOOK demo script; this table is the explorer companion. Every action in
the UI shows a "tx ↗" link (steppers) or a "view tx ↗" toast — click through instead of
hunting for the tx.

| Act | Tx (who signs) | What to look for on the explorer |
|---|---|---|
| 0. Faucet mints | Desk A + B | `mint` calls on the mock tokens; ERC-20 `Transfer` from `0x0` to each desk. |
| 1. Authorize ratifier | Desk A | `setIsAuthorized` on Midnight, event `SetIsAuthorized(caller, authorized=ratifier, true, onBehalf=A)`. |
| 1. Approve mUSDC | Desk A | ERC-20 `Approval(A → Midnight, max)`. **Note: no deposit ever happens** — this allowance is all the maker commits. |
| 1. Sign + post quote | — (no tx!) | Nothing on-chain. Point at the explorer: the maker's address shows *zero* new transactions. The offer lives only on the RFQ server until someone takes it. |
| 2. Supply collateral | Desk B | `supplyCollateral`; ERC-20 `Transfer` of mWETH B → Midnight; `SupplyCollateral` event. |
| 2. **Take** | **Desk B** | The centerpiece — one tx containing: `Take` event (offer hash, units, buyerAssets/sellerAssets, maker, taker) **and** an mUSDC `Transfer` **directly from A to B** (`from = Desk A`, `to = Desk B`). Midnight never holds the loan token — check the Midnight address token balances to prove non-custody. Also show: the tx was *sent by B* but *moved A's funds* — that's the signed offer + allowance at work. |
| 3. Reverse-direction take | Desk A | Same anatomy, roles swapped: A pays, transfer A → B via `receiverIfMakerIsSeller`. |
| 4. Repay | Desk B | `Repay` event; mUSDC `Transfer` B → Midnight for the full 7,000. Market `withdrawable` (rail, left screen) jumps. |
| 4. Withdraw credit | Desk A | `Withdraw` event; mUSDC `Transfer` Midnight → A of 7,000. A's wallet balance delta vs. what A paid = the realized fixed rate. |
| 4. Withdraw collateral | Desk B | `WithdrawCollateral`; mWETH `Transfer` Midnight → B, position empty. |
| 5. Cancel (optional) | Desk A | `CancelRoot` event on the **ratifier** contract; afterwards a take attempt reverts `RootCanceled` (the UI explains it in plain English). |

### Reading the Take tx in detail (verified contracts)

On the tx page open the **Logs** tab:

1. `Take` (Midnight) — check `units`, `buyerAssets`, `sellerAssets` (equal, fee = 0),
   `maker`, `taker`, `newConsumed` (running fill against the offer's group budget).
2. `Transfer` (mUSDC) — `from` maker, `to` taker (buy offer) for `sellerAssets`. There are
   two transferFrom calls in the contract; the fee leg is 0 in this build.
3. On the **State** tab (Basescan) you can show Midnight's storage changing — credit/debt
   bookkeeping — while its **token balance stays 0** for the loan token.

## 4. Pilot sanity checklist before you start

- [ ] `cd contracts && forge test` — 5 passing (struct/hash/encoding gate).
- [ ] `pnpm test:shared` — 8 passing.
- [ ] `RPC_URL=https://sepolia.base.org pnpm test:server` — 9 passing against the live
      testnet deployment (this proves the TS typed-data matches the deployed ratifier).
- [ ] `curl localhost:8787/api/health` returns your deployed addresses.
- [ ] Both profiles connect, chips show, rail facts populate (oracle 2,500 / LLTV 0.86).
- [ ] Contracts show the green "verified" check on the explorer.

If a take reverts mid-pilot, the modal maps the revert to a plain-English cause
(see RUNBOOK troubleshooting table) — the most common are `RatifierUnauthorized`
(maker skipped the checklist) and `SellerIsLiquidatable` (not enough collateral).
