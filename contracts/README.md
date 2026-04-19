# theorise contracts

Smart contracts for the Theorise vault platform on HyperEVM.

## Layout

- `src/HLConstants.sol` — pinned addresses & action IDs for HyperCore <> HyperEVM.
- `src/PerpOrderSpike.sol` — minimal contract proving the EVM → HyperCore order path.
- `script/DeploySpike.s.sol` — Foundry deploy script.
- `test/PerpOrderSpike.t.sol` — encoding sanity checks (mocked CoreWriter).

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
