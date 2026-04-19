# theorise contracts

Smart contracts for the Theorise vault platform on HyperEVM.

## Layout

- `src/HLConstants.sol` — pinned addresses & action IDs for HyperCore <> HyperEVM.
- `src/PerpOrderSpike.sol` — minimal contract proving the EVM → HyperCore order path.
- `src/Vault.sol` — single-thesis vault (EIP-1167 clone target).
- `src/VaultFactory.sol` — creator-facing deployer that clones `Vault`.
- `script/DeploySpike.s.sol` — Foundry deploy script for the spike.
- `test/PerpOrderSpike.t.sol` — encoding sanity checks (mocked CoreWriter).
- `test/Vault.t.sol` — share math, creator lock, penalty split, state machine.
- `test/VaultFactory.t.sol` — clone + registration flow.
- `test/VaultPhaseB.t.sol` — deposit-direction CoreWriter routing & scaling.

## Step 2 design — vault mechanics

### Lifecycle (single-phase)

```
           deposit()                          settle() (permissionless after expiryTs)
  ┌─────────────────────────┐               ┌────────────────────────────────────┐
  │                         ▼               │                                    ▼
  ▼                        OPEN ────────────┴───────────────────────────────── SETTLED
creator's IM pulled       creator locked     unwind positions,                 claim() pro rata
by factory, orders        depositors can     creator unlocked                  (no penalty)
auto-routed               earlyWithdraw()
                          with 50/50 penalty
                          split (protocol / LPs)
```

### Scam-prevention rules codified in `Vault.sol`

1. **Immutable position spec** stored + hashed at init. Creator cannot swap
   assets or leverage mid-flight.
2. **Creator's own IM is share-locked until settle()** — they earn alongside
   depositors, can't rug.
3. **Only two creator-callable entrypoints**: `deposit` and `earlyWithdraw` —
   same as any depositor. No `placeOrder`, no `sweep`, no `rescue`.
4. **`settle()` is permissionless** after `expiryTs`. A keeper cron runs it
   automatically; if the keeper ever fails, any EOA can trigger it.
5. **CoreWriter action bytes are built by the contract** using values from
   the stored spec — never caller-supplied. So "whitelisting" is achieved
   by construction: the only bytes `_deployToCore` can emit are bridge +
   spot→perp + IOC orders at `(asset, side, allocBps, lev)` from the spec.

### Share math — pessimistic NAV

NAV = `totalIM` (running sum of deposited USDC). A later phase can swap in
`totalIM + unrealized PnL from accountMarginSummary precompile` once that
struct layout is pinned from a live mainnet call. Pessimistic NAV is
deterministic and sidesteps the CoreWriter ~seconds delay between
`sendRawAction` and HyperCore execution.

### Early-exit penalty

`earlyExitBps()` is a virtual function returning `0` in the v1 impl. To flip
on later: subclass Vault, override `earlyExitBps` to return `200`, deploy new
factory pointing at new impl. Existing vaults stay at 0 (immutable via impl).

Split is hardcoded 50/50 between `protocolTreasury` and remaining LPs
(the LP half stays inside the vault, so it shows up as higher per-share NAV
for everyone who didn't exit).

## Phase B — deposit-direction CoreWriter wiring

`_deployToCore(amount)` is no longer a stub. When `coreRoutingEnabled` is
true on the factory, each `deposit()` (and the initial creator deposit at
`createVault`) triggers three operations in sequence:

1. ERC20 USDC transfer to `CORE_DEPOSIT_WALLET` (bridge EVM → HyperCore spot).
2. CoreWriter action 7 (`USD_CLASS_TRANSFER`), `(ntl=amount, toPerp=true)`:
   move the freshly-bridged spot USDC into the vault's perp margin account.
3. For each position, CoreWriter action 1 (`LIMIT_ORDER`) as IOC with a ±5%
   slippage cap. Order size is derived from the position's `allocBps` + `lev`
   + current `markPx` (read from the precompile in the same tx).

### Scaling assumptions (validate on mainnet before flipping the flag)

- `markPx` precompile returns `uint64`, scaled by `10^(6 - szDecimals)`.
- Order `limitPx` and `sz` are each scaled by `10^8`.
- Derivation used in `_placeIocOrder`:
  - `px_1e8 = markPx * 10^(szDecimals + 2)`
  - `sz_1e8 = notional_6dp * 10^8 / (markPx * 10^szDecimals)`
- `szDecimals` is supplied per-position at `createVault` (wizard passes it).

Example: BTC at $67,000 with `szDecimals=5` gives `markPx = 670_000`. For a
$100 creator IM, 50% alloc, 3× leverage → posNotional = $150 → order size
`223_880` (≈ 0.0022388 BTC), limit price `7_035_000_000_000` (≈ $70,350,
mark × 1.05 for a buy). `test/VaultPhaseB.t.sol` locks in these values.

### Safety gate: `coreRoutingEnabled`

`VaultFactory.coreRoutingEnabled` is an immutable bool passed at deploy.
First mainnet deploys use `false` (vaults behave like Phase A — USDC stays
idle in the vault, safe). Flip to `true` by deploying a new factory after
validating the assumptions above on a burner vault.

When routing is on:
- `earlyWithdraw` reverts with `InsufficientBalance` because the USDC isn't
  sitting in the vault anymore. (Phase C will add a proper early-exit path
  that closes a proportional slice of the position and unbridges back.)
- `claim` reverts with `InsufficientBalance` until the Core → EVM unbridge
  (Phase C) repatriates USDC after settle.

### Phase B open items (resolve on mainnet before flipping the flag)

1. Confirm `markPx` precompile scaling on a live asset — is it really
   `10^(6 - szDecimals)` or something else?
2. Confirm order `sz` scaling — is the `10^8` from the docs literal, or is
   it `szDecimals`-dependent?
3. Confirm the action 7 USD-class transfer accepts `amount` in 6-dp USDC
   units (what we pass) vs some other scaling.
4. Measure the actual CoreWriter delay between `sendRawAction` and the
   HyperCore execution block. Sets the keeper cooldown.
5. Work out the Core → EVM unbridge mechanism. `spotSend` (action 6) with
   a specific destination? Separate system precompile? Needed for Phase C
   claim/unwind.

## Step 1 findings (CoreWriter spike)

### Subaccount model — decided

**Each contract address IS its own HyperCore principal.** When a HyperEVM
contract calls CoreWriter, actions execute against an account derived from the
contract's address. No HL-level subaccounts are required.

Implication for the vault factory: every cloned `Vault` proxy automatically
gets its own isolated HyperCore margin account. The factory holds no funds
and never touches HyperCore.

### CoreWriter

- Address: `0x3333333333333333333333333333333333333333`
- Interface: `function sendRawAction(bytes calldata data) external;`
- Action layout: `0x01 || actionId(3 bytes BE) || abi.encode(...params)`
- Actions are **delayed a few seconds** before HyperCore executes them.
  Don't read precompile state in the same tx that sent the action.

| Action | ID | Params |
|---|---|---|
| Limit order | 1 | `(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif, uint128 cloid)` |
| USD class transfer (spot↔perp) | 7 | `(uint64 ntl, bool toPerp)` |
| Cancel by orderId | 10 | `(uint32 asset, uint64 orderId)` |
| Cancel by cloid | 11 | `(uint32 asset, uint128 cloid)` |

TIF: `1=ALO`, `2=GTC`, `3=IOC`. Prices and sizes are scaled by `10^8`.

### Read precompiles (`staticcall`, snapshot at start of EVM block)

| Address | Returns |
|---|---|
| `0x0800` | `position(user, perp)` |
| `0x0806` | `markPx(perpIndex)` (uint64) |
| `0x0807` | `oraclePx(perpIndex)` (uint64) |
| `0x080F` | `accountMarginSummary(perpDexIndex, user)` |
| `0x0810` | `coreUserExists(user)` (bool) |

Full list in `HLConstants.sol`.

### USDC bridge (EVM → HyperCore spot)

Send ERC20 USDC to the system "core deposit wallet". The sender's HyperCore
spot account is credited with the same amount. Then call CoreWriter action 7
to move from spot → perp margin.

| Network | USDC ERC20 | Core deposit wallet |
|---|---|---|
| Mainnet | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` | `0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24` |
| Testnet | `0x2B3370eE501B4a559b57D449569354196457D8Ab` | `0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206` |

## Mainnet validation runbook

The rest of the platform already trades on Hyperliquid mainnet, so the spike
is validated there too. **Use small amounts (~$5–10 USDC) — this is real money
and the contract has no withdrawal path.**

1. Set env:
   ```sh
   export HYPEREVM_RPC=https://rpc.hyperliquid.xyz/evm
   export PRIVATE_KEY=0x<your funded mainnet eoa>
   ```
2. Deploy (mainnet is the default; set `TESTNET=true` to flip):
   ```sh
   forge script script/DeploySpike.s.sol \
     --rpc-url $HYPEREVM_RPC --private-key $PRIVATE_KEY --broadcast
   ```
3. Send a small amount of mainnet USDC ERC20 to the deployed contract
   (`0xb88339CB7199b77E23DB6E890353E22632Ba630f`).
4. Bridge to HyperCore spot:
   ```sh
   cast send $SPIKE "bridgeUsdcToCore(uint256)" <amount_in_6dp> \
     --rpc-url $HYPEREVM_RPC --private-key $PRIVATE_KEY
   ```
5. Move spot → perp:
   ```sh
   cast send $SPIKE "moveUsdClass(uint64,bool)" <amount_in_6dp> true \
     --rpc-url $HYPEREVM_RPC --private-key $PRIVATE_KEY
   ```
6. Place an IOC order (e.g. BTC asset 0, buy 0.0001 BTC at $200k cap so it
   fills near mark):
   ```sh
   cast send $SPIKE "placeIocOrder(uint32,bool,uint64,uint64)" \
     0 true 20000000000000 10000 \
     --rpc-url $HYPEREVM_RPC --private-key $PRIVATE_KEY
   ```
7. Check the L1 explorer ~5s later — the action should appear first as an
   "enqueuing" then as a HyperCore execution. Then read back position state:
   ```sh
   cast call $SPIKE "accountMarginSummary(uint32,address)" 0 $SPIKE \
     --rpc-url $HYPEREVM_RPC
   ```

## Open items (resolve before step 2)

1. Confirm the exact byte layout of `accountMarginSummary` return data on a
   live testnet call — the lib references a `Position` struct but the docs
   don't pin the field order.
2. Verify there's no minimum bridge amount or fee at `CORE_DEPOSIT_WALLET`.
3. Confirm `setLeverage` is exposed via CoreWriter (the lib excerpt didn't
   include it). May need to use a different action ID or place orders with
   leverage already set on the account.
4. Time the actual delay between `sendRawAction` and HyperCore execution to
   set the right cooldown for `activate`/`settle` in the vault.
