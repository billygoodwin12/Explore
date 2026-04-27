# SPIKE — testnet probes before the creator-vault rewrite

Four questions to answer with cheap testnet calls before we commit to the
v0.1 contract design. Each probe is a single function on `PerpOrderSpike.sol`
and one or two HL-info-endpoint queries to verify the result.

**All commands assume:**
- You're in `/home/user/Explore/contracts`
- `forge` and `cast` are on `PATH` (`source ~/.foundry/bin/foundryup` or use full paths)
- `HYPEREVM_TESTNET_RPC=https://rpc.hyperliquid-testnet.xyz/evm`
- `PRIVATE_KEY=0x…` is a testnet EOA funded with HYPE for gas
- That EOA's HL testnet account has been faucet-funded with USDC

---

## 0. One-time deploy + fund the spike contract

```bash
export HYPEREVM_TESTNET_RPC=https://rpc.hyperliquid-testnet.xyz/evm
export PRIVATE_KEY=0xYOUR_TESTNET_KEY
export TESTNET=true

# Deploy
forge script script/DeploySpike.s.sol \
  --rpc-url $HYPEREVM_TESTNET_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast

# Note the deployed address from the output. Save it:
export SPIKE=0xDEPLOYED_SPIKE_ADDRESS

# Sanity: verify the contract knows its USDC + bridge wallet
cast call $SPIKE "usdc()(address)" --rpc-url $HYPEREVM_TESTNET_RPC
# expected: 0x2B3370eE501B4a559b57D449569354196457D8Ab

cast call $SPIKE "coreDepositWallet()(address)" --rpc-url $HYPEREVM_TESTNET_RPC
# expected: 0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206
```

Send the spike contract some USDC and bridge it to its HL Core spot account:

```bash
# 50 USDC = 50_000_000 (USDC is 6dp)
cast send 0x2B3370eE501B4a559b57D449569354196457D8Ab \
  "transfer(address,uint256)" $SPIKE 50000000 \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY

# Bridge to Core spot
cast send $SPIKE "bridgeUsdcToCore(uint256)" 50000000 \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY

# Move spot -> perp margin so we can place orders later
cast send $SPIKE "moveUsdClass(uint64,bool)" 50000000 true \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

Wait ~10 seconds between cast sends — CoreWriter actions don't reflect
on HyperCore until the next L1 block.

---

## Probe (d) — does a fresh contract address have an HL account by default?

The cheapest probe — single staticcall, no transactions, no fees.

```bash
# BEFORE bridging anything, against a fresh address that has never touched HL.
# Re-deploy a new spike or use any deterministic CREATE2 address you haven't used.
cast call $SPIKE "coreUserExists(address)(bool)" $SPIKE \
  --rpc-url $HYPEREVM_TESTNET_RPC

# AFTER bridging USDC to it (above), repeat the same call:
cast call $SPIKE "coreUserExists(address)(bool)" $SPIKE \
  --rpc-url $HYPEREVM_TESTNET_RPC
```

**Expected:**
- Before: `false` — confirms HL accounts are NOT auto-created for arbitrary addresses
- After USDC bridge: `true` — first credit creates the account implicitly

**Implication for v0.1 contract:** if the first deposit is what creates the
vault's HL account, nothing extra needed in `initialize()`. If pre-funding
is required, factory must do it before letting LPs deposit.

---

## Probe (a) — does CoreWriter accept a builder fee, and does it arrive?

**Step 1 — approve our test builder address (one-time):**

```bash
# Pick any EOA you control as the "Theorise builder" for this test.
# Approve it to take up to 50 bps (0.5%) on the spike contract's orders.
export BUILDER=0xYOUR_BUILDER_ADDRESS

cast send $SPIKE "approveBuilderFee(address,uint64)" $BUILDER 50 \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

**Step 2 — place a small market-ish IOC order on a liquid testnet perp.**
ETH-PERP on testnet is asset 4 (verify via `info` endpoint if it's changed):

```bash
# Read current mark for ETH-PERP (asset id 4)
cast call $SPIKE "markPx(uint32)(uint64)" 4 --rpc-url $HYPEREVM_TESTNET_RPC

# Suppose markPx returns M (raw uint64). Compute:
#   pxLimit_1e8 = M * 10^(szDecimals + 2) * 1.05  (5% above mark, since long)
#   sz_1e8     = (notional_usdc_6dp * 10^8) / (M * 10^szDecimals)
# For ETH szDecimals = 4. Pick notional = 10 USDC = 10_000_000 (6dp).
# Easier: just hard-code numbers from a HL info read against the spike's perp account.

# Place the order (plug in your computed limit + size)
cast send $SPIKE "placeIocOrder(uint32,bool,uint64,uint64)" \
  4 true <LIMIT_1E8> <SZ_1E8> \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

**Step 3 — verify the builder fee arrived:**

```bash
# Check the builder's fee state via HL info endpoint.
# The spike contract is the "user" whose orders we placed.
curl -s -X POST https://api.hyperliquid-testnet.xyz/info \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"userFills\",\"user\":\"$SPIKE\"}" \
  | jq '.[] | select(.builderFee > 0) | {oid, builderFee, builder}'
```

**Expected:** the most recent fill has a `builderFee` > 0 and `builder` matches `$BUILDER`.

**If empty or zero builderFee:** action 12's payload format may differ from what the docs imply, OR builder fees on CoreWriter aren't routed the same way as exchange-API orders. Either way, the contract approach to revenue needs a redesign before we lock in Path 1.

---

## Probe (b) — can a contract pull USDC from HyperCore back to its EVM ERC20 balance?

Pre-condition: the spike contract has USDC in its **Core spot** account (not perp). If you moved everything to perp during step 0, move some back:

```bash
# perp -> spot (5 USDC)
cast send $SPIKE "moveUsdClass(uint64,bool)" 5000000 false \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

Wait ~10s, then check the spike's ERC20 USDC balance pre-bridge-back:

```bash
cast call 0x2B3370eE501B4a559b57D449569354196457D8Ab \
  "balanceOf(address)(uint256)" $SPIKE \
  --rpc-url $HYPEREVM_TESTNET_RPC
# record this number
```

Fire the unbridge:

```bash
cast send $SPIKE "bridgeUsdcBackToEvm(uint64)" 5000000 \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

Wait ~10s, then re-check:

```bash
cast call 0x2B3370eE501B4a559b57D449569354196457D8Ab \
  "balanceOf(address)(uint256)" $SPIKE \
  --rpc-url $HYPEREVM_TESTNET_RPC
# expected: pre-balance + 5_000_000
```

**Expected:** balance increased by 5,000,000 (5 USDC).

**If balance unchanged:** `sendAsset` payload layout is different than assumed,
or the system address `0x20…00` isn't the right destination on testnet. Check
the spike's transaction receipt for any revert; check HL's `userFills`/
`userNonFundingLedgerUpdates` for the spike's address to see what HL recorded.
Adjust `bridgeUsdcBackToEvm` payload encoding and re-run.

This is the highest-risk probe — if the unbridge mechanism doesn't match
the docs, the entire withdrawal path of the v0.1 contract needs to be
redesigned (likely: keeper-custody fallback, or buffer that lives on Core
rather than EVM).

---

## Probe (c) — fallback only: can an EOA agent be authorized on a contract's HL account?

**Run this only if (a) or (b) fails.** If Path 1 works end-to-end, skip — we
don't need agents in v0.1.

```bash
export AGENT=0xANY_TESTNET_EOA_YOU_CONTROL

cast send $SPIKE "addApiWallet(address,string)" $AGENT "theorise-spike" \
  --rpc-url $HYPEREVM_TESTNET_RPC --private-key $PRIVATE_KEY
```

Verify the agent is listed for the spike's account:

```bash
curl -s -X POST https://api.hyperliquid-testnet.xyz/info \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"extraAgents\",\"user\":\"$SPIKE\"}" | jq
```

**Expected:** non-empty array containing `$AGENT` and `name: "theorise-spike"`.

If yes → Path 2 is a viable fallback architecture. Document and proceed.

---

## Bonus: confirm `accountMarginSummary` precompile layout for the vault account

Once the spike has USDC and an open perp position (from probe a), read the
margin summary. This validates the precompile we'll use for `totalAssets()`
in the v0.1 contract.

```bash
cast call $SPIKE "accountMarginSummary(uint32,address)(bytes)" 0 $SPIKE \
  --rpc-url $HYPEREVM_TESTNET_RPC
```

Decode the returned bytes off-chain. Per the hyper-evm-lib reference, the
struct is `(int64 accountValue, uint64 marginUsed, uint64 ntlPos,
uint64 rawUsd)` but verify by comparing against:

```bash
curl -s -X POST https://api.hyperliquid-testnet.xyz/info \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"clearinghouseState\",\"user\":\"$SPIKE\"}" | jq
```

Confirm the precompile bytes decode to numbers that match the JSON's
`marginSummary.accountValue`, `crossMarginSummary.totalMarginUsed`, etc.
**Implication:** if the layout matches, the v0.1 contract can read NAV
trustlessly from the precompile in `totalAssets()`. If not, revisit the
keeper-pushed NAV fallback (see DECISIONS.md).

---

## What to capture in DECISIONS.md after running

For each probe, add three lines under `## v0.1 spike findings` in
`/home/user/Explore/DECISIONS.md`:

- **Status**: working / broken / partially working
- **Result**: the exact tx hash + any non-default behavior observed
- **Implication**: what the v0.1 contract design now does (or stops doing)

Then ping me with the spike outputs and I'll move into the contract write.
