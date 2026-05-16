# Theorise Contracts

Solidity sources for the Theorise creator-vault platform on HyperEVM.

## Setup

Submodules need to be pulled in after a fresh clone:

```sh
git submodule update --init --recursive
```

## Build & test

```sh
forge build
forge test
```

## Deploy a CreatorVault

The deploy script auto-selects the Circle `CoreDepositWallet` by chainid
(mainnet `0x6B9E…0A24`, testnet `0x0B80…C206`). Override with `CDW_ADDRESS`
in the env if needed.

Copy `.env.example` to `.env`, fill in `PRIVATE_KEY` + `USDC_ADDRESS`, then:

```sh
export $(grep -v '^#' .env | xargs)
forge script script/DeployCreatorVault.s.sol \
  --rpc-url <hyperevm_mainnet|hyperevm_testnet> \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

The deploy script reads `USDC_ADDRESS`, optional `CREATOR_ADDRESS`,
`ADMIN_ADDRESS`, `VAULT_NAME`, and `VAULT_SYMBOL` from the env. Defaults:
creator/admin = deployer, name = "Theorise Test Vault", symbol = "tVAULT".

## Deployment runbook — MANDATORY pre-activation step

After deploying a vault, the admin **MUST** pre-activate its Core spot
account before opening deposits to users. Otherwise the first user's
deposit silently loses 1 USDC to Circle's `newCoreAccountFee` and
dilutes everyone (see `INVESTIGATION_EVM_DEPOSIT.md` §12 for the
empirical evidence + the on-chain guard that enforces this).

Pre-activation flow:

1. Get the deployed vault address from the script output. Call it
   `VAULT_ADDR`.
2. From an admin EOA that holds at least 2 USDC on **HyperCore** (not
   EVM), send 2 USDC to `VAULT_ADDR` via the HyperLiquid UI's spot
   transfer or via `usdSend`. The first 1 USDC is consumed as
   `newCoreAccountFee`; the remaining 1 USDC settles on the vault's
   Core spot account.
3. Verify with `cast`:
   ```sh
   cast call "$VAULT_ADDR" "totalAssets()(uint256)" \
     --rpc-url <hyperevm_mainnet|hyperevm_testnet>
   ```
   Should return `1000000` (= 1 USDC, 6-dec) or higher.
4. Once `totalAssets() > 0`, the vault is ready. Users can now call
   `deposit()` without the `VaultNotActivated()` revert.

If you skip this step, `deposit()` will revert on every user attempt
with `VaultNotActivated()`. No funds are at risk — the guard catches
the issue at the EVM boundary — but UX is broken until pre-activation
is performed.

The pre-activation 1 USDC is a one-time bootstrap cost per vault.
Treat it as a deployment overhead. Subsequent inbound bridges to the
same vault (via the user `deposit()` flow) credit 1:1 with no
additional fee.

## Mainnet bridge verification protocol

Before exposing a freshly-deployed vault to users on mainnet, run
`script/MainnetBridgeProbe.s.sol` from a throwaway EOA to confirm
the CDW bridge credits Core spot end-to-end on the deployment
network. See `INVESTIGATION_EVM_DEPOSIT.md` §12.1 for the consolidated
bridge verification narrative (three mainnet probes, cross-block
settlement empirically 0 blocks).

## Per-tx TVL cap (admin-controlled risk lever)

The per-tx TVL cap was the PR 2-NEW interim mitigation for the
async-bridge sandwich window. PR 3-NEW's in-flight tracker eliminates
that window structurally, so the cap is no longer load-bearing.

- **Default in PR 3-NEW: `DEPOSIT_TVL_CAP_DISABLED`** — no cap applied.
- Admin can re-enable on a per-vault basis with
  `setDepositTvlCapBps(uint16 bps)`. Bounds: `[100, 10_000]` (1% to 100%).
- Sentinel `DEPOSIT_TVL_CAP_DISABLED = type(uint16).max` restores the
  default (no cap).

**When to enable.** Production observation surfaces a concern (e.g.,
HyperLiquid block-time changes, CoreWriter behavior change, large
single-deposit risk concern for a specific creator). Otherwise leave
disabled.

## Integration notes for UI and indexer

The following behaviors are correct-by-design but require careful
handling in client code. Read these before integrating.

### `totalAssets()` staleness window

Between bridge settlement (Core balance grows) and the next state-
mutating tx (which calls `_settlePending`), `totalAssets()` may briefly
read slightly inflated values. The just-settled bridge is counted twice
(once in `coreSpot`, once in `pendingBridgedUsdc`) until the next
`_settlePending` call drains the pending entry.

- **Share math (internal) is unaffected.** Every state-mutating
  function calls `_settlePending` at entry.
- **External reads (UI / indexer) see the staleness.** UI should
  display "estimated NAV" with a refresh affordance. Indexers should
  debounce on state-mutating events rather than view-polling.

See `KNOWN_ISSUES.md` §8.

### 1-wei breach-cap-edge

A creator depositing exactly at the cap (`creatorStakeCapUsdc`, default
$250K) can transiently flip into a `StakeBreachStarted` event due to
floor rounding in `convertToAssets`. The breach self-heals on the next
state-mutating call.

- **UI:** suggest creators deposit slightly above the cap (e.g., $250K +
  1 USDC headroom).
- **Indexer:** suppress single-block `StakeBreachStarted` /
  `StakeBreachCured` pairs as noise.

See `KNOWN_ISSUES.md` §7.

### `RedeemPendingSettlement` recovery UX

If `redeemCore` fails with `RedeemPendingSettlement(spotAvailable,
amountRequested, pendingInflight, estimatedBlocksUntilSettlement)`, the
caller's redeem amount is covered by in-flight bridges that haven't
settled on Core yet.

- **UI:** display "waiting for deposits to settle, retry in
  ~`estimatedBlocksUntilSettlement` blocks". This is an upper bound;
  actual settlement is typically sub-block (observed mainnet probe 3).
- Do NOT surface as a hard failure.

### Activation fee on first deposit

A vault's first inbound Core credit incurs Circle's 1 USDC
`newCoreAccountFee`. Admin pre-activates vaults with 1 USDC before
opening deposits (handled by deployment runbook above).

### Bridge silent-fail recovery

If a `_bridgeToCore` call's EVM tx succeeds but Core credit doesn't
land within `SETTLEMENT_BLOCKS_FALLBACK` (= 100 blocks ≈ 100s), the
tracker auto-expires the pending entry via the time-based fallback.

- **EVM USDC** remains in the vault contract if the bridge never
  fired — anyone can call permissionless `sweepStrandedEvmUsdc()` to
  retry.
- **Indexer:** monitor `PendingBridgeExpired(amountExpired,
  pendingStartAfter)` events as anomaly signals. Under normal
  operation, only `PendingBridgeSettled` events fire (observation-based
  detection).

## Layout

- `src/CreatorVault.sol` — ERC-4626 creator vault with inline CDW
  bridge, in-flight tracker, reentrancy guards, structured errors.
- `src/HLConstants.sol` — HyperLiquid addresses + CoreWriter + CDW
  interface.
- `script/DeployCreatorVault.s.sol` — chainid-aware single-vault deploy.
- `script/MainnetBridgeProbe.s.sol` — bridge-verification probe.
- `script/VerifyBridge.s.sol` — legacy testnet bridge probe.
- `test/CreatorVault.t.sol` — 91-test suite covering deposit/redeem,
  bridge accounting, tracker observation + fallback, TVL cap,
  sandwich-window closure, stake-cure state machine, hardening
  (reentrancy, SafeCast, fee validation, structured redeem errors).
- `test/BridgeForkTest.t.sol` — Foundry mainnet fork test of the direct-
  transfer pattern (proves the failing path so we can't regress to it).

See `../DECISIONS.md` for the architectural rationale,
`../INVESTIGATION_EVM_DEPOSIT.md` for the bridge investigation +
PR 3-NEW design notes, and `../KNOWN_ISSUES.md` for residual issues +
deferred work.
