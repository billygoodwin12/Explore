# INVESTIGATION_EVM_DEPOSIT.md

**Subject:** Findings from §2 of `THEORISE_EVM_DEPOSIT_MIGRATION.md` — investigation of prior EVM-side deposit + bridge attempts before committing to the migration.

**Author:** Claude Code, via line-by-line review of git history, DECISIONS.md, archived spike contracts, and live testnet evidence collected during the May 8-9 sessions, plus a fresh testnet re-run on May 10 (§6 below).

**TL;DR:** The migration's premise (direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` credits the contract's Core spot balance) was tried and **failed empirically on testnet** on May 9. A fresh testnet re-run on May 10 (§6) confirms the same revert with the same error message. The bridge mechanism the migration doc proposes does not work from a contract on testnet today.

**Recommendation:** Path C confirmed. Migration is moot for testnet. Bill must choose between:
- Path B: probe mainnet ($5-10 of real USDC) to verify whether Circle's mainnet USDC has the same Blacklistable rule. Mainnet may behave differently — Circle's CoreDepositWallet processes $1.27B+ live there.
- Path D: skip the mainnet probe and resume the relayer architecture from the original audit's PR 2.

---

## 1. WHAT WAS PREVIOUSLY TRIED

The EVM-side deposit + EVM→Core bridge from a contract was the **original** Phase 1.5 design. It was attempted three times across April 19 → May 9, 2026, before being abandoned. The relevant artifacts are all still in the repo.

### 1.1 Spike contract (April 19 → April 28)

Commit `b3a1249` ("feat(contracts): spike CoreWriter perp order path on HyperEVM", April 19) introduced `contracts/src/PerpOrderSpike.sol` — a minimal contract with the exact end-to-end flow proposed by the migration doc:

```solidity
function bridgeUsdcToCore(uint256 amount) external onlyOwner {
    require(IERC20(usdc).transfer(coreDepositWallet, amount), "usdc transfer");
    emit UsdcBridged(amount);
}
```

(See `contracts.archive/src/PerpOrderSpike.sol:59-64`.) This was paired with a runbook (`contracts.archive/SPIKE.md`) describing the exact `cast send` commands to validate the path on testnet.

The spike was iterated through several configurations:
- Commit `1d32fe5` ("scaffold testnet probes for CoreWriter Path 1 verification") — initial setup pointing at the legacy CoreDepositWallet (`0x0B80…` testnet).
- Commit `94880b2` ("use canonical 0x2000…0000 system address for USDC bridge") — switched to direct transfer to the per-token system address, with this telling commit message excerpt:

> "Testnet probe of the legacy 0x0B80… wallet showed bridge tx succeeding on-chain but no Core spot credit ever landing. Switching to the system address should fix this."

That commit acknowledges the first concrete failure on testnet: tx succeeded, no credit landed.

- Commit `29d1b69` ("use canonical HL-bound USDC address on testnet") — corrected which USDC address the spike was operating on after `spotMeta` confirmed which contract was the actual ERC-20 token vs the bridge proxy.

### 1.2 v0.1 → Phase 1.5: integrated bridge as `bridgeToCore` (May 4)

The spike was archived (commit `128b63c` "Archive sandbox contracts/ to start clean rebuild") and the integrated `CreatorVault.sol` was built. Commit `50fa5bd` ("feat(vault): Phase 1.5 — CoreWriter wiring") added a creator-only `bridgeToCore(amount, toPerp)` that depositors' EVM USDC could be bridged through. Commit message:

> "bridgeToCore(amount, toPerp): IERC20.approve + Circle CoreDepositWallet.deposit() for moving vault USDC EVM → Core. Verified call signature via HL docs: deposit(uint256, uint32) where the dex is 0 (perp) or type(uint32).max (spot). Creator-only."

This used Circle's `CoreDepositWallet.deposit()`, not direct transfer. The vault accepted standard ERC-4626 EVM USDC deposits; creator manually bridged accumulated funds.

### 1.3 First fix attempt: switch to `depositFor` (May 8)

Live testnet testing of `bridgeToCore(5_000_000)` produced the symptom: tx succeeded on EVM, vault Core spot balance did not increase after 60s+ wait. Investigation (research agent, May 8 session) discovered:

- Direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` from a contract **reverts** with Circle USDC's `Blacklistable: account is blacklisted` modifier — Circle blocks this destination as a recipient when transferred from a contract.
- The canonical pattern used by production HyperEVM protocols (per `hyper-evm-lib`) is `CoreDepositWallet.depositFor(recipient, amount, destinationDex)`.

Commit `494ed9d` ("fix(vault): bridgeToCore via Circle CoreDepositWallet, not direct system-address transfer") switched the implementation to `BRIDGE.depositFor(address(this), amount, DEX_SPOT)`. This is the same pattern the migration doc proposes minus the `depositFor` part — but the migration doc proposes plain `transfer` to `USDC_SYSTEM_ADDRESS`, which is the reverted-on-testnet path we already established doesn't work.

### 1.4 Second fix attempt: empirical testing of `depositFor` (May 9)

The May 9 session ran the corrected `depositFor` path on testnet:

| Attempt | Amount | EVM tx | Vault Core spot before | Vault Core spot after | Result |
|---------|--------|--------|------------------------|------------------------|--------|
| 1 | 5 USDC | OK logs show vault → CoreDepositWallet → system address | 5 USDC | 5 USDC | "appears to work" — later attributed to EOA UI activation send, not the contract bridge |
| 2 | 2 USDC | OK logs identical to #1 | 5 USDC | 5 USDC | Silent failure — no credit |
| 3 | 6 USDC | OK logs identical | 5 USDC | 5 USDC | Silent failure — no credit |

The "5 USDC visible after attempt 1" was later identified as the user's separate **EOA Core → vault Core** transfer (sent via HL UI to activate the vault's Core account, ~30 seconds before the contract bridge tx). The contract bridge itself never credited any of the three attempts. We have no positive empirical confirmation that the contract bridge worked even once on testnet.

This is when the architecture pivot happened (commit `b22d545`, May 9). Commit message excerpt:

> "Drops the EVM USDC + bridge approach entirely. After repeated bridge failures (Circle CoreDepositWallet only credited the first 5 USDC; 2 and 6 USDC bridges silently failed), and the realization that HL native vaults already use Core-side deposits as the canonical UX, restructure as: …"

The "first 5 USDC" claim in this commit message was incorrect — see paragraph above. Even the "first credit" was actually the parallel EOA send. Net evidence: zero out of three contract-initiated bridge attempts credited Core.

### 1.5 Reverse direction also tested + fixed in same period

Commit `592005e` ("fix(vault): bridgeToEvm payload — system-address destination + 8-dec amount", May 8) fixed three encoding bugs in the `Core → EVM` direction (`bridgeToEvm`, using CoreWriter action 6 `spotSend`). This direction did get testnet validation later in the May 9 session — the redemption flow successfully spotSent USDC from vault Core back to the user's EOA Core (`0xF256…c040` saw the inbound). So Core → EVM via action 6 works. EVM → Core does not (per all testnet evidence).

---

## 2. WHAT BROKE / WHY IT WAS ABANDONED

Three distinct failure modes were observed:

### 2.1 Direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` reverts

When called from a contract:

```
Error: Failed to estimate gas: server returned an error response: error code 3:
execution reverted: revert: Blacklistable: account is blacklisted,
data: "0x08c379a0…426c61636b6c69737461626c653a206163636f756e7420697320626c61636b6c6973746564…"
```

The Circle USDC contract's `Blacklistable` modifier blocks transfers where the recipient or sender is blacklisted. On testnet, the system address `0x2000000000000000000000000000000000000000` is blacklisted as a recipient when transfers come from contracts. (EOA-initiated transfers may behave differently; we did not test that, since the migration doc's design path is contract-initiated.)

This is **the exact path the migration doc proposes**. Per the doc's §3.3:

> ```solidity
> SafeERC20.safeTransfer(IERC20(asset()), HLConstants.USDC_SYSTEM_ADDRESS, net);
> ```

Per our May 9 testnet evidence: this reverts. **Confirmed again by the May 10 re-run — see §6.**

### 2.2 Circle's `CoreDepositWallet.deposit/depositFor` silently fails

When called from a contract:

- EVM tx succeeds (`status: 1`).
- Tx logs show the full transfer chain: vault → CoreDepositWallet (`transferFrom`), CoreDepositWallet → `0x2000…0000` system address, `BridgedToCore` event.
- **Core spot balance never increases.** Polled at 30s, 60s, 4 minutes — no credit.

Three separate amounts (5, 2, 6 USDC) all behaved identically. The first appeared to credit but was attributed to a parallel EOA UI transfer, not the contract.

Possible explanations not ruled out:
- HL testnet's bridge proxy behavior is buggy / under-maintained for this path.
- There's a per-account or per-amount minimum that we never crossed.
- The activation fee mechanism interacts poorly with contract callers (HL's docs state 1 USDC activation fee on first inbound, but the post-activation behavior also failed).
- Some testnet-specific Circle blacklist / whitelist applies to contracts beyond what's been documented.

We have no diagnostic visibility into Core's settlement layer to determine which.

### 2.3 No prior `CoreWriter` action that bypasses both paths was found

There is no third documented path from EVM to Core from a contract. CoreWriter's `sendAsset` (action 13) and `spotSend` (action 6) operate **from** Core, not to it. The ONLY documented EVM → Core paths are:

1. ERC-20 transfer to per-token system address (testnet: blacklisted from contracts).
2. Circle's CoreDepositWallet proxy (testnet: silent-fail from contracts per our testing).

Both fail on testnet. Mainnet likely behaves differently — Circle's CoreDepositWallet processes $1.27B+ live USDC on mainnet per a research agent's May 8 finding. But mainnet testing requires real funds.

---

## 3. WHAT I CANNOT DETERMINE FROM THE REPO

These are the open questions Bill needs to resolve before proceeding:

### 3.1 Is the testnet failure a testnet-specific quirk that does NOT apply on mainnet?

DECISIONS.md notes (entry "Native USDC vs CoreDepositWallet"):

> "vault contracts (and any code reading user USDC) call the native ERC-20 address. Bridging EVM→Core is `IERC20.approve(bridge, x) → bridge.deposit(x)` (NOT `IERC20.transfer` to the bridge — that's a silent no-op)."

This was Phase 0 research, written before any contract testing. It says transferring directly to the bridge address is a no-op. But the migration doc proposes transferring to `USDC_SYSTEM_ADDRESS` which is a different address (`0x2000…0000` vs `0x0b80…` testnet bridge) — and we have empirical evidence that direct transfer to `0x2000…0000` reverts on testnet rather than no-op'ing.

It's plausible mainnet either (a) doesn't have the Circle blacklist, or (b) credits the system address transfer correctly. We don't know. The only way to find out is run the verification script on mainnet with real money.

### 3.2 Has HL testnet behavior changed since May 9?

We re-ran on May 10 (§6). **It has not changed.** The same `Blacklistable: account is blacklisted` revert reproduced exactly.

### 3.3 Was the spike's original test on `0x0B80…` a different failure mode than what we observed on May 9?

Commit `94880b2` (April 28) noted "bridge tx succeeding on-chain but no Core spot credit ever landing" using the legacy CoreDepositWallet address (`0x0B80…` testnet). On May 9 we observed the same symptom against the same address using `depositFor`. So the failure may be one and the same — just rediscovered after the architecture switched.

I don't have explicit visibility into whether `94880b2`'s spike test was using `transfer` (which would now revert) or `deposit/depositFor` (which would silent-fail). The commit message says "bridge tx succeeding" suggests it didn't revert — pointing at silent-fail. But the spike contract's `bridgeUsdcToCore` (in `contracts.archive/src/PerpOrderSpike.sol:62`) uses plain `transfer`, which **should** revert on testnet today. There may have been a testnet behavior change between April 28 (transfer no-op'd) and May 9 (transfer reverts). I can't reconstruct that timeline from the repo alone.

### 3.4 Why did the migration doc's author not know about the prior failures?

If the doc was written without conversation history of the May 9 sessions, that explains it. If it was written with that history, then either:
- The doc's author believes the failures were testnet-specific and mainnet would work.
- The doc's author wants us to retest because they suspect we never properly isolated the contract-bridge from the EOA-bridge confound.

Bill should confirm which. If it's the former, run the verification script on mainnet. If the latter, run it on testnet first.

### 3.5 Was the `depositCoreWallet` minimum ever ruled out?

The May 9 session attempted 5, 2, and 6 USDC. The "5 succeeded" was disambiguated as actually the EOA send. So we have no positive bridge-via-contract observations. It's possible there is a minimum amount (say, 5 USDC) below which the bridge doesn't credit, but the test that would have hit "5 from contract specifically" wasn't isolated cleanly. Re-running with 100 USDC from a fresh contract on a fresh address would help disambiguate.

---

## 4. DECISION TREE

The question is binary: does the EVM → Core bridge work from a contract?

**Path A: Verification script passes on testnet.**
Evidence reverses prior findings. Either (a) HL has fixed the testnet behavior, or (b) our prior tests had a confound we never identified. Proceed with the migration as specified in the doc. Run all PRs 2-NEW through 7-NEW. **— RULED OUT by May 10 re-run.**

**Path B: Verification script fails on testnet, passes on mainnet probe ($5-10).**
Testnet quirk confirmed. Mainnet works. Migration proceeds, but we accept "no contract testing on testnet for the deposit flow" as a permanent constraint. UI mocks the bridge step on testnet; real validation only on mainnet.

**Path C: Verification script fails on both testnet and mainnet probe.**
Migration is moot. Stay with the relayer architecture from the original audit. Accept the operational complexity (server, key, nonce store) as the price of bypassing the broken bridge path.

**Path D: Bill doesn't want to spend mainnet money.**
Migration is moot until either an HL testnet update unblocks the bridge or someone else does the mainnet probe. Stay with the relayer architecture.

**Status as of May 10:** Path A ruled out. Bill must now choose between Path B (mainnet probe) and Path D (skip probe, resume relayer).

**Status update (May 10, later) — Phase 1 mainnet fork test FAILED:** Path B is now also ruled out by a Foundry mainnet fork test (`contracts/test/BridgeForkTest.t.sol`). The same `Blacklistable: account is blacklisted` revert reproduces against real Circle USDC at `0xb88339CB7199b77E23DB6E890353E22632Ba630f` on mainnet RPC `https://rpc.hyperliquid.xyz/evm`. Circle's blacklist on `0x2000…0000` is active across both networks. See §9.

---

## 5. VERIFICATION SCRIPT

Provided as `contracts/script/VerifyBridge.s.sol`. Two run modes:

- **Default `run()`**: deploys a `BridgeProbe` contract, sends 5 USDC from EOA to the probe, has the probe attempt to bridge to its own Core spot via direct transfer to `USDC_SYSTEM_ADDRESS`. Bill polls the spot balance off-chain via the cast/curl commands the script prints.
- **`runWithAmount(uint256)`**: same but with a user-specified amount. Useful for ruling out a per-amount minimum (test with 100 USDC if 5 USDC fails).

The script distinguishes the failure modes:
- If the bridge tx **reverts** — catch logs the reason. If "Blacklistable: account is blacklisted", we're confirmed in the same testnet failure as May 9.
- If the bridge tx **succeeds** — script prints follow-up commands for Bill to poll Core spot balance over time. If credit lands within 60 seconds: Path A confirmed. If credit never lands within 5 minutes: Path C silent-fail confirmed.

To run on testnet (already executed May 10):

```bash
cd contracts
export $(grep -v '^#' .env | xargs)

forge script script/VerifyBridge.s.sol:VerifyBridge \
  --sig "run()" \
  --rpc-url $HYPEREVM_TESTNET_RPC \
  --private-key $PRIVATE_KEY --broadcast --legacy
```

To run on mainnet (NOT yet executed; requires conscious decision to spend real funds):

```bash
# Same script, mainnet RPC + mainnet USDC. Required env adjustments:
#   USDC_ADDRESS=0xb88339CB7199b77E23DB6E890353E22632Ba630f
#   HYPEREVM_MAINNET_RPC=https://rpc.hyperliquid.xyz/evm
export USDC_ADDRESS=0xb88339CB7199b77E23DB6E890353E22632Ba630f

forge script script/VerifyBridge.s.sol:VerifyBridge \
  --sig "run()" \
  --rpc-url https://rpc.hyperliquid.xyz/evm \
  --private-key $PRIVATE_KEY --broadcast --legacy
```

Mainnet cost estimate: ~5 USDC + ~0.001 HYPE for gas. If the script reverts, the 5 USDC stays in the EOA. If it succeeds and credit lands on Core, the probe contract holds 5 USDC on Core spot — recoverable via cast call to `spotSendBackToEvm` then withdrawing from the probe's EVM USDC balance.

---

## 6. EMPIRICAL OBSERVATIONS FROM RE-RUN

```
Date / time:                  May 10, 2026
Network:                      HyperEVM testnet (chain 998)
EOA:                          0xF25610b5fD0ed0eca96f35124D9916EDcf39c040
EOA USDC balance before:      41,000,000 (41 USDC, 6-dec)
Probe contract address:       0x5beC60C8B890872bFABeC3E2F1d7Faf907Ba5eAe (simulated)
USDC amount probed:           5,000,000 (5 USDC, 6-dec)

Result:                       REVERT — Circle USDC `Blacklistable: account is blacklisted`
Selector:                     0x08c379a0 (Error(string))
Revert string (decoded):      "Blacklistable: account is blacklisted"

Tx broadcast status:          NOT broadcast — script reverted in simulation phase, no
                              testnet HYPE spent, no on-chain effect.
Core spot balance:            N/A — bridge tx never landed on Core (reverted on EVM first).

Conclusion:                   Path C reached. Testnet behavior is unchanged since May 9.
                              The direct-transfer-to-system-address path the migration doc
                              proposes does NOT work from a contract on testnet.

                              Migration is moot for testnet. Two options remain:
                              - Path B: probe mainnet with $5-10 to verify whether
                                Circle's mainnet USDC has the same Blacklistable rule.
                              - Path D: accept the testnet failure and resume the
                                relayer architecture (prior audit's PR 2).
```

**Trace excerpt (the revert frame):**

```
[5200] BridgeProbe::bridgeViaSystemAddress(5000000 [5e6])
  ├─ [3777] ::transfer(0x2000000000000000000000000000000000000000, 5000000 [5e6])
  │   ├─ [3058] ::transfer(0x2000000000000000000000000000000000000000, 5000000 [5e6]) [delegatecall]
  │   │   └─ ← [Revert] Blacklistable: account is blacklisted
  │   └─ ← [Revert] Blacklistable: account is blacklisted
  └─ ← [Revert] Blacklistable: account is blacklisted
```

The `[delegatecall]` frame indicates Circle's testnet USDC is a proxy. The
`Blacklistable` rule lives in the implementation behind the proxy; the rule is
Circle USDC's own modifier, not an HL-layer rejection. The system address
(`0x2000…0000`) is on Circle's blacklist as a forbidden recipient of contract-
initiated transfers.

Identical symptom to the May 9 testnet attempt that triggered the original
architecture pivot to Core-deposit.

---

## 7. FILES REFERENCED

- `contracts/src/CreatorVault.sol` — current Phase 1.5 (Core-deposit) production.
- `contracts.archive/src/PerpOrderSpike.sol` — original April 19 spike contract; lines 58-64 are the EVM → Core bridge attempt via direct `transfer`.
- `contracts.archive/SPIKE.md` — original testnet runbook for the spike.
- `DECISIONS.md` — Phase 0 architectural decisions.
- Git commits: `b3a1249`, `1d32fe5`, `94880b2`, `29d1b69`, `50fa5bd`, `494ed9d`, `592005e`, `b22d545`.

---

## 8. RECOMMENDATION

**Do not delete the relayer fallback work mentally yet.** Keep the prior audit's PR 2 (EIP-712 + relayer) as a viable architecture until Bill explicitly chooses one of:
- Path B — run the script on mainnet with $5-10. If it succeeds, migration proceeds for mainnet only. UI mocks the bridge step on testnet.
- Path D — skip the mainnet probe. Resume PR 2 of the prior audit (relayer architecture). Migration is permanently shelved.

**Specifically: do not start any PR 2-NEW through 7-NEW work in this branch until Bill decides between Path B and Path D.**

PR 1 (stake-floor changes) is already merged and is independent of the deposit architecture; it stands regardless of which path we take.

**Update post Phase 1 fork test (May 10):** Path B is now ruled out by the
`BridgeForkTest` (see §9). The system-address `transfer` reverts on mainnet
the same way it does on testnet. Two viable next steps remain:

- **Phase 3 — find the canonical bridge.** Inspect production HL ecosystem
  contracts on mainnet (Kinetiq, HypurrFi, Felix, Hyperdrive, Hyperlend,
  HLP-style native vaults) that demonstrably hold Core spot USDC funded
  from EVM. Reverse-engineer how they got there. Possible patterns to
  investigate: a HL-blessed bridge contract address, CoreWriter
  `ACTION_SEND_ASSET` (action 13) used bidirectionally, or a Circle/HL
  whitelist mechanism we don't know about yet.
- **Path D (relayer fallback).** Roll back PR 2-NEW. Restore the EIP-712
  intent + relayer architecture from the original audit's PR 2.

PR 2-NEW code is committed to the branch but should NOT be merged in its
current form — its `deposit()` would revert on the very first call.

---

## 9. PHASE 1 MAINNET FORK TEST RESULT

```
Date / time:                  May 10, 2026 (later)
Test:                         contracts/test/BridgeForkTest.t.sol::test_mainnet_evm_side_does_not_revert
Network:                      HyperEVM mainnet fork (chain 999)
Fork RPC:                     https://rpc.hyperliquid.xyz/evm
USDC contract:                0xb88339CB7199b77E23DB6E890353E22632Ba630f (real Circle mainnet)
Probe contract:               BridgeProbe (deployed in-test, deal()-funded)
Test amount:                  50,000,000 (50 USDC, 6-dec)

Result:                       REVERT — Circle USDC `Blacklistable: account is blacklisted`

Trace excerpt:
  [5083] BridgeProbe::bridge(50000000 [5e7])
    ├─ [3777] 0xb88339...0f::transfer(0x2000...0000, 50000000 [5e7])
    │   ├─ [3058] 0x003f73...F8::transfer(0x2000...0000, 50000000 [5e7]) [delegatecall]
    │   │   └─ ← [Revert] Blacklistable: account is blacklisted

Implementation address (delegatecall target): 0x003f73f58ca78880DA3642c5CB71d7459B3Fe4F8
```

**Implication:** Circle's USDC `Blacklistable` modifier blocks transfers to
`0x2000…0000` from contracts on mainnet, identically to testnet. The
`transfer(USDC_SYSTEM_ADDRESS, X)` pattern that PR 2-NEW's `deposit()` uses
will revert in production. Migration cannot proceed without finding a
different EVM → Core bridge path.

**Phase 2 was NOT run.** Per the protocol's decision tree, "REVERTS" branches
straight to Phase 3 (canonical bridge investigation) without spending real
funds on the on-chain probe.

PR 2-NEW artifacts are still on this branch for reference:
- `contracts/src/CreatorVault.sol` — ERC-4626 deposit implementation
- `contracts/test/BridgeForkTest.t.sol` — Phase 1 fork test (this evidence)
- `contracts/script/MainnetBridgeProbe.s.sol` — Phase 2 script (unused; kept
  in case a working bridge pattern is later identified)
- `contracts/test/CreatorVault.t.sol` — 60 unit tests including the
  async-window divergence test (`test_async_two_deposits_same_block_diverge`)
  which captures the sandwich-window finding for whichever bridge path we
  eventually pick.

---

## 10. PHASE 3 RESULT — CANONICAL BRIDGE IDENTIFIED

Phase 3 (canonical bridge investigation) found the pattern used by
production HL protocols. Three independent codebases confirm the same
3-line call:

```solidity
usdc.safeTransferFrom(msg.sender, address(this), amount);   // pull
usdc.forceApprove(coreDepositWallet, amount);               // approve
ICoreDepositWallet(coreDepositWallet).depositFor(           // bridge
    recipient,                                              // address(this) for vault Core
    amount,                                                 // 6-dec USDC
    uint32(type(uint32).max)                                // 0xFFFFFFFF = SPOT dex; 0 = perps
);
```

**Confirmed in:**
1. **Monetrix** (Code4rena April-2026 audit) — `MonetrixVault.sol` lines 232-233.
   Production-audited reference.
2. **Circle's own `CctpForwarder`** at mainnet `0xb21d281dedb17ae5b501f6aa8256fe38c4e45757`.
   Successfully calls CDW from a contract context. Live tx:
   `0x979af8585618aeaab7e514d385f1dcf7a2682d3f9aae3598752949d4f4d47fa7`.
3. **`hyper-evm-lib::CoreWriterLib::bridgeToCore`** — the de-facto HL SDK,
   used widely across the ecosystem.

**Mainnet bridge addresses:**

| Item | Address |
|---|---|
| Circle USDC (HyperEVM) | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` |
| **CoreDepositWallet (mainnet)** | `0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24` |
| **CoreDepositWallet (testnet)** | `0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206` |
| CDW impl (mainnet) | `0x7537af00779cc053a696e47ebd451b5bc4790da3` |
| CDW `tokenSystemAddress()` | `0x2000…0000` (verified) |
| `USDC.isBlacklisted(CDW)` | **false** (= safe to call from contracts) |
| Mainnet CDW activity | 450,206 txs, $1.27B USDC throughput |

**How CDW bypasses the blacklist.** CDW does `transferFrom(caller, CDW, amount)`
— neither side blacklisted, so the transfer is permitted. CDW then emits a
synthetic `Transfer(CDW → 0x2000…0000, amount)` event without actually
calling `transfer` on USDC; HyperCore listens for this synthetic event and
credits the `recipient` on Core spot. For `destinationDex != SPOT`, CDW
additionally fires CoreWriter action 13 (`SEND_ASSET`) to forward from
spot to perps.

**PR 2-NEW corrections applied:**
- `deposit()` and `sweepStrandedEvmUsdc()` now use the CDW pattern via
  internal `_bridgeToCore` helper.
- `HLConstants.sol` adds `CORE_DEPOSIT_WALLET_MAINNET`,
  `CORE_DEPOSIT_WALLET_TESTNET`, `CDW_DESTINATION_SPOT`,
  `CDW_DESTINATION_PERPS`, and the `ICoreDepositWallet` interface.
- Vault constructor accepts `coreDepositWallet_` so the same vault code
  runs against testnet, mainnet, and test mocks.
- Tests deploy a `MockCoreDepositWallet` that absorbs `transferFrom`
  USDC into itself, allowing balance assertions to remain correct.

**Sandwich-window mitigation (interim, PR 2-NEW).** Per-tx TVL cap
`depositTvlCapBps` defaults to 500 (5%). Admin-tunable inside [1%, 100%],
with `DEPOSIT_TVL_CAP_DISABLED` sentinel for full disable once PR 3-NEW's
proper in-flight tracker lands. See `KNOWN_ISSUES.md` §1.

**Mainnet probe — still required before merge.** The fork test only proves
the EVM-side call doesn't revert; a fork cannot observe Core. Testnet
showed three rounds of silent-fail in May. The only authoritative
verification is a live mainnet probe with precompile readback. See
`contracts/script/MainnetBridgeProbe.s.sol` (updated with CDW pattern).
Cost: ~$5-10 USDC + ~$1 gas, ~30 min including recovery.

**Architectural decision.** A sub-agent recommended Monetrix's "split"
architecture (sync `deposit()` + permissioned `keeperBridge`) as a
defensive optimization. Rejected: that pattern reintroduces the keeper
operational profile (server uptime, key management, trust narrative)
that Theorise explicitly excluded. PR 2-NEW keeps inline bridging — the
bridge call happens inside the user's `deposit()` tx, fully self-contained.
The interim cap bounds the residual sandwich-window risk.

---

## 11. PRODUCTION DESIGN NOTES (PR 3-NEW)

Forward-looking design rationale that complements the historical
investigation (§§1-10) and the PR 3-NEW tracker implementation (§13).
Audit reviewers should treat this section as the "why we built it this
way" reference.

### 11.1 CoreWriter callback semantics (verified)

Reentrancy guards added in PR 3-NEW (commit `edd7dde`) as defense-in-depth.
CoreWriter's `sendRawAction` was verified to be fire-and-forget via three
independent sources:

1. **Bytecode disassembly** of the precompile at `0x3333333333333333333333333333333333333333`
   on HyperEVM mainnet. Zero `CALL` / `CALLCODE` / `DELEGATECALL` / `STATICCALL`
   opcodes. A 400-iteration gas-burn loop, a single `LOG2` emission with topic
   hash `0x8c7f585fb295f7eb1e6aeb8fba61b23a4fe60beda405f0045073b185c74412e3`
   indexed by `msg.sender`, then return. Function selector: `0x17938e13` =
   `sendRawAction(bytes)`. **Structurally impossible** for the precompile to
   re-enter the caller.

2. **HyperLiquid documentation** (Gitbook "Interacting with HyperCore"):
   CoreWriter "burns ~25,000 gas before emitting a log to be processed by
   HyperCore as an action." Order actions and vault transfers are "delayed
   onchain for a few seconds" and appear twice in the L1 explorer ("first
   as an enqueuing and second as a HyperCore execution"). Strictly async.

3. **Mainnet receipt inspection** for tx
   `0x62b2ad07d2cb09d6f4e1e1d3c53e7fcf8f40191d7ebe0fd0bf6936b7b061fe13`
   (block 35039134): receipt has exactly 1 log emitted by CoreWriter,
   status success, gas used 154,980. Call structure:
   `EOA → Caller → CoreWriter (LOG2, return)`. No reverse edge.

Reentrancy posture across reference protocols (researched May 15):

| Protocol | ReentrancyGuard | nonReentrant on CoreWriter-firing fns |
|---|---|---|
| `hyper-evm-lib` (CoreWriterLib.sol) | No | No |
| Monetrix (MonetrixVault.sol) | Yes | Selective (guards on user-funds entry points only) |
| Kinetiq (StakingManager.sol) | Yes | All `l1Write.*`-wrapping fns |
| Circle CoreDepositWallet | No | N/A |

Theorise chose Kinetiq's defensive posture: `nonReentrant` on every
state-mutating function (`deposit`, `mint`, `redeemCore`, `moveOnCore`,
`placeOrder`, `setBuilderFee`, `sweepStrandedEvmUsdc`). Cost: ~2.3k gas
per call. Benefit: forward-safe against future CoreWriter behavioral
changes; protects against malicious-ERC20 reentrancy on
`safeTransferFrom`; consistent audit narrative ("every state-mutating
function is guarded").

Test coverage: `test_reentrancy_guard_blocks_recursive_deposit` uses a
mock `ReentrantCdw` contract that re-enters `vault.deposit` during its
own `depositFor` callback. Specific selector assertion:
`ReentrancyGuard.ReentrancyGuardReentrantCall`. Smoke-test demonstrates
the wiring; OZ's library tests cover the modifier mechanics.

### 11.2 AQAv2 framework reference (May 14, 2026)

Coinbase and Circle jointly announced the AQAv2 framework: Coinbase
becomes the official USDC treasury deployer on HyperLiquid; Circle
formally retains the technical deployer role for USDC minting,
redemption, and cross-chain infrastructure (including CCTP). The
CoreDepositWallet at `0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24` is
unchanged and remains the canonical bridge contract under AQAv2.
Coinbase shares the majority of USDC reserve yield with the HyperLiquid
Foundation.

**Implications for Theorise:** none at the contract layer. The bridge
mechanism we verified empirically on May 12-13 (mainnet probes 1-3) is
unchanged. USDC's institutional backing on HyperEVM is stronger; the
choice of USDC as vault asset is validated. Worth re-reading the
AQAv2 technical spec when published for any contract-level integration
requirements (e.g., yield-claim mechanics).

Sources:
- Coinbase / HyperLiquid announcement, May 13-14 2026 (CoinDesk, The Block, FXStreet)
- Circle CCTP retention on HyperEVM (Bitcoin.com, news.bitcoin.com)

---

## 12. PHASE 2 MAINNET PROBES — historical record

**Historical record of the May 2026 mainnet probe sequence.** For the
consolidated bridge-verification argument that audit reviewers should
reference, see **§13.1** ("Bridge verification — three mainnet probes
consolidated"). This section is retained for context and to preserve
the empirical iteration trail.

Ran the updated `MainnetBridgeProbe.s.sol` (CDW pattern) on HyperEVM
mainnet from a fresh, throwaway deployer EOA. Two separate bridge txs
gave us two empirical data points (a third probe with pre-fired
polling followed on May 13).

### 12.1 First bridge — fresh Core account

```
Deployer EOA:       0xA9e3F1cE0358252f74FcE41E27213E7d1B4aDD8F  (fresh)
Probe contract:     0x2c9e2a1A329520026A0E523B72fF4FEF816217C7
Bridge tx hash:     0x20c5e98545faec9605963dafa5ce1fa1c1d337a4ded5dc8f436a07eb5d2374cd
Bridge tx block:    34,954,695
Amount sent in:     5,000,000  (5 USDC)
Amount credited:    4,000,000  (4 USDC)  ← 1 USDC short
First poll block:   34,954,776  (delta = 81 blocks)
First poll showed:  4,000,000   (credit had already landed)
```

**Finding A — `newCoreAccountFee` is 1 USDC, not 0.** The Phase 3 agent
inferred from CDW source that the fee was 0 on mainnet. Empirically false:
a fresh Core account (probe had never held Core USDC before) pays a 1 USDC
activation fee on its first inbound. This is a `NewCoreAccountFeeApplied`
event the agent did not observe in advance.

**Finding B — settlement latency upper bound: 81 blocks (~80s).** The first
poll already saw the credit, so actual latency is *somewhere between 1 and
81 blocks*. Probably much faster; the 80s gap is mostly the wall-clock
time between bridge submission and the first poll iteration.

### 12.2 Second bridge — already-activated Core account

```
Bridge tx hash:     0x148a35fec04775831c0c6b4b2a2583e4b7e6dbde5e3c44f42147ce593031c5af
Bridge tx block:    34,955,573
Amount sent in:     1,000,000  (1 USDC)
Amount credited:    1,000,000  (1 USDC)  ← no fee
First poll showed:  5,000,000  (= prior 4 + new 1; credit had landed)
First poll delta:   92 blocks
```

**Finding C — steady-state bridges credit 1:1.** Once a Core account is
activated, subsequent inbound bridges via CDW credit the full amount with
no further deduction. Confirms the activation fee is one-time per Core
account (per-recipient).

**Finding D — steady-state latency upper bound: ≤92 blocks (~92s).** Same
measurement limitation as the first bridge: the polling loop's baseline
read happened *after* Core had already credited. The lower bound is sub-
block (settlement may be synchronous with the bridge tx itself); the upper
bound is 92 blocks. We can't tighten without running a third probe with
polling started *before* the bridge tx is sent.

### 12.3 Implications for PR 2-NEW

| Question | Answer |
|---|---|
| Does the CDW bridge work on mainnet? | Yes. |
| Does it work from a contract caller? | Yes. |
| Are there silent failures? | No, both bridges credited as expected. |
| Activation fee? | 1 USDC, per Core account, one-time. |
| Settlement latency? | ≤92 blocks (~92s) upper bound; likely much less. |
| Is the 5% TVL cap right-sized? | Yes — bounds sandwich window regardless of exact latency. |

### 12.4 Operational consequence — vault pre-activation

Because of Finding A, the first user to deposit into a fresh vault would
silently lose 1 USDC to the activation fee, while the share-math computes
against the gross deposit. This is a small but real dilution of subsequent
depositors (the first depositor mints against pre-bridge NAV which doesn't
know about the 1 USDC shortfall).

PR 2-NEW addresses this with:

1. **Code-side guard.** `deposit()` reverts with `VaultNotActivated()` if
   the vault's Core spot balance is zero. Forces admin to pre-activate
   before any user deposit.
2. **Operational runbook.** Admin sends 2 USDC directly to the vault's
   Core address (via HL UI or `usdSend`) immediately after deployment.
   After the 1 USDC activation fee, the vault has 1 USDC on Core (>0) and
   `deposit()` becomes callable. See README §"Deployment runbook".

### 12.5 Latency margin for PR 3-NEW in-flight tracker

The in-flight tracker should expire pending entries after at least
**~100 blocks (~2 minutes)** for safety. That's the observed 92-block
upper bound plus a small headroom for occasional slow settlements. Tighter
bounds require a third probe with pre-bridge polling (which became
§13.1's third probe on May 13).

### 12.6 Funds disposition

Per operational discipline: leave the 5 USDC on the probe's Core spot,
drain HYPE from deployer EOA back to main wallet, abandon the EOA. Do not
reuse the deployer key.

---

## 13. PR 3-NEW: IN-FLIGHT BRIDGE TRACKER

PR 3-NEW (commits `edd7dde`, `b287f0b`, `84031a1`, `7f329d3`, `0459fb8`)
closes the async-bridge sandwich window via an in-flight tracker that
includes pending bridge amounts in `totalAssets()` until HyperCore has
settled them.

### 13.1 Bridge verification — three mainnet probes consolidated

| Probe | Date | Bridge block | Credit block | Δ blocks | Δ wallclock | Notes |
|---|---|---|---|---|---|---|
| 1 (fresh account) | May 12 | 34,954,695 | ≤34,954,776 | [1, 81] | ≤80s | 1 USDC `newCoreAccountFee` deducted; credit observed at first poll (loop started after bridge confirmed) |
| 2 (activated) | May 12 | 34,955,573 | ≤34,955,663 | [1, 90] | ≤90s | Polling cadence too slow to capture exact credit block |
| 3 (activated, pre-fired polling) | May 13 | 35,040,457 | 35,040,457 | **0** | <1s | Credit visible in the same block bridge tx confirmed |

**Conclusion:** EVM→Core USDC bridge via `CoreDepositWallet.depositFor` is
effectively synchronous for cross-block correctness. From a subsequent
external `cast call` reading the spot-balance precompile, the credit is
observable starting in the same block the bridge tx confirmed.
**Same-block intra-tx behavior is unverified** — we did not test whether a
follow-up tx within the same block sees the credit.

This empirical evidence reframes the tracker's purpose: not load-bearing
for cross-block correctness, but defense-in-depth against same-block
ordering ambiguity and silent-failure-mode recovery.

### 13.2 Tracker design

State (storage layout at `CreatorVault.sol`):

```solidity
struct PendingBridge { uint128 amount; uint64 enqueueBlock; }
PendingBridge[] internal pending;          // append-only FIFO
uint256 internal pendingStart;              // head pointer
uint256 public pendingBridgedUsdc;          // running sum of live entries
uint256 internal lastCheckedCoreSpot;       // observation checkpoint
uint256 internal inFlightFromPerp;          // moveOnCore(toPerp=false) expected inflow
uint256 public constant SETTLEMENT_BLOCKS_FALLBACK = 100;
```

Algorithm: `_settlePending()` is called at entry of every state-mutating
function. Three-step:

1. **Reserve perp→spot inflows.** If `currentSpot > lastCheckedCoreSpot`,
   consume the growth against `inFlightFromPerp` first. Prevents
   misattribution of `moveOnCore(toPerp=false)` settlements as bridge
   settlements.
2. **Observation-based drain.** Remaining growth drains pending entries
   oldest-first. Partial entries supported.
3. **Time-based fallback expiry.** Walk pending head-forward and hard-expire
   entries older than `SETTLEMENT_BLOCKS_FALLBACK`. Silent-failure safety
   net (per testnet history).

`totalAssets()` returns `_coreSpotUSDC() + _corePerpAccountValue() + pendingBridgedUsdc`.
This is the single edit that closes both KNOWN_ISSUES §1 (sandwich
window) and KNOWN_ISSUES §2 (transient breach state).

### 13.3 Sizing decision: `SETTLEMENT_BLOCKS_FALLBACK = 100`

Justification:

- **Measured cross-block settlement (3 probes):** 0 blocks (probe 3),
  bounded above at 81 (probe 1) and 90 (probe 2) due to polling lag.
- **Observation-based detection** clears pending entries within 1-2
  `_settlePending` calls under normal operation. The fallback never
  fires in the common case.
- **Fallback purpose:** silent-failure-mode recovery (per testnet
  history, May 9). If a bridge's EVM-side succeeds but HyperCore never
  credits, the pending entry would otherwise accumulate forever. The
  fallback caps the impact at 100 blocks (~100s) of stale NAV
  over-counting.
- **100 blocks = ~100× safety margin** vs measured 0-block latency.
  Generous; auditor-friendly. Tighter would require a measurement
  scheme that we don't have today.

### 13.4 PR 3-NEW commit map

| Commit | Hash | Scope | Tests |
|---|---|---|---|
| 1 — hardening | `edd7dde` | `ReentrancyGuard` (7 fns), `SafeCast.toUint64`, fee config validation (`FeeConfigInvalid`), structured redeem errors (`RedeemPerpPositionsOpen`, `RedeemInsufficient`, replacing `InsufficientSpot`) | +6 |
| 2 — tracker state | `b287f0b` | `PendingBridge` struct, `pending` queue, `pendingStart` head pointer, `pendingBridgedUsdc`, `_settlePending`, `_enqueuePending`, `totalAssets()` change, `CreatorVaultHarness` for isolated tests | +9 |
| 3 — wiring | `84031a1` | `_settlePending` at entry of `_doDeposit`, `redeemCore`, `moveOnCore`, `placeOrder`, `setBuilderFee`, `sweepStrandedEvmUsdc`. `_enqueuePending` after bridge in `_doDeposit` and `sweepStrandedEvmUsdc`. `RedeemPendingSettlement` error + cascade insertion. `inFlightFromPerp += amount` in `moveOnCore(toPerp=false)` | +5 |
| 4 — cap default | `7f329d3` | `depositTvlCapBps` default flipped to `DEPOSIT_TVL_CAP_DISABLED`. Admin opt-in path retained | (test refactor) |
| 5 — docs | `0459fb8` + this commit | §11 production design notes, §12 historical record marker + renumber, §13 tracker design; KNOWN_ISSUES closures + new entries; README integration notes; `RedeemAmountZero` patch | +1 |

---

## 14. PR 4: TIME-LOCKED ADMIN OPERATIONS

PR 4 places admin-controlled state changes that affect user economics
behind a mandatory delay. Closes the trust-narrative gap where a
compromised admin key can immediately raise fees, lower the creator
stake cap, or tighten the per-tx TVL cap to grief users. See
`../PR4_DESIGN_NOTES.md` for the full design rationale.

### 14.1 Scope and delays

Four functions are timelocked. Per-function delays, not a uniform value
— different operations have different blast radii.

| Parameter | Delay | Rationale |
|---|---|---|
| `setDepositFee(bps, recipient)` | 24h | Direct economic impact on every depositor; users need notice to act. |
| `setDepositTvlCapBps(bps)` | 24h | Affects depositor UX directly (per-tx cap). |
| `setBuilderFee(builder, maxFeeRate)` | 24h | Affects trading economics for the creator. |
| `setCreatorStakeCap(newCap)` | 7 days | Both raise and lower can push creators into breach or change required-stake levels; creators need real notice to top up. |

Deferred (separate work):
- **`Ownable.transferOwnership`** — different operation (admin role
  handoff, not parametric). Adding propose/execute requires wrapping
  the inherited OZ function. Tracked in `KNOWN_ISSUES.md` §11.
- **Builder identity changes** — separate from builder fee. Out of
  scope. Tracked in `KNOWN_ISSUES.md` §12.

### 14.2 Design: inline state, all-changes-timelocked

**Inline state, not OZ `TimelockController`.** Four pending structs
(`pendingFeeChange`, `pendingStakeCap`, `pendingTvlCap`,
`pendingBuilderFee`) stored directly on the vault. Avoids deploying a
separate controller per vault; lower gas; smaller audit surface.

**All changes timelocked, no direction-sensitive shortcuts.** Every
admin parameter change goes through propose + execute at the delay
appropriate for that parameter. Considered and rejected
"lowering = immediate" optimization: encoding direction per parameter
adds two code paths per function, ambiguous semantics (raising stake
cap = restrictive for creators or protective for depositors?), and
mistakes are likely.

**Fee bps + recipient bundled atomically.** `proposeDepositFeeChange(uint16
newBps, address newRecipient)` proposes both fields together. The PR
3-NEW invariant `bps > 0 ⟹ recipient != 0` would otherwise admit
transient invariant violations during the proposal window.

**One pending change per parameter at a time.** Proposing while pending
exists reverts `PendingChangeExists(executableAt)`. Admin must call
`cancelPending<X>` explicitly to abandon a stale proposal. No silent
overwrites; no queued multi-proposal.

### 14.3 Commit map

| Commit | Hash | Scope | Tests |
|---|---|---|---|
| 1 — scaffolding | `b97438b` | 4 delay constants, 4 pending state structs, 12 events, 3 errors, 12 onlyOwner stub functions | 0 (existing 91 pass) |
| 2 — propose logic | `7e2e541` | `propose<X>` for all four params: pending-exists check, bounds validation, `executableAt = now + delay`, emit `*Proposed` | 0 |
| 3 — execute logic | `0a52e30` | `execute<X>` for all four: `NoPendingChange` + `TimelockNotElapsed` guards, copy pending → live, delete pending, emit legacy + `*Executed` events | 0 |
| 4 — cancel logic | `0731051` | `cancelPending<X>` for all four: read for event payload, delete, emit `*Cancelled` | 0 |
| 5 — remove immediate setters | `ac63901` | Remove `setDepositFee`, `setCreatorStakeCap`, `setDepositTvlCapBps`, `setBuilderFee` from public surface. Migrate 29 test callsites to helpers (happy path) and direct propose calls (revert path) | (refactor) |
| 6 — tests | `22844f5` | 18-test dedicated timelock suite: state machine (8), parameter-specific (5), access control (3), delay constants (1), sentinel paths (1) | +18 |
| 7 — docs | this commit | INVESTIGATION §14, KNOWN_ISSUES §11/§12, README admin runbook | 0 |

---

## 15. PR 5 ATOMIC-FLOW PROBE — same-tx Core credit visibility

PR 5's factory `createVault` wants to perform vault deployment,
activation-fee bridge, creator-stake bridge, and share mint in a
single transaction. The question: does the precompile read of
`_coreSpotUSDC()` reflect a `CoreDepositWallet.depositFor` call made
earlier in the same tx? If yes, the vault's existing
`VaultNotActivated()` guard passes inside the same tx and the atomic
flow works as designed. If no, the vault needs a factory-only
`bootstrapDeposit` entry point that skips the activation guard.

### 15.1 Probe design

`contracts/script/MainnetAtomicProbe.s.sol` — `MainnetAtomicProbe`
contract deployed to mainnet via fresh throwaway EOA. Two-step:

1. forge script deploys the probe and funds it with 2 USDC.
2. `cast send` calls `probe.probe(2000000)`. The probe contract
   `forceApprove`s USDC to CDW, calls `CDW.depositFor(self, 2e6,
   SPOT)`, then immediately reads `_coreSpotUSDC()` via the spot
   precompile and stores the result to `lastIntraReadValue`.

Sent 2 USDC so the result was disambiguated from the
`newCoreAccountFee`: 1 USDC absorbed as fee, 1 USDC net credit.
Outcome:

- `lastIntraReadValue == 1e6` ⇒ case (a), intra-tx visible.
- `lastIntraReadValue == 0` while `readCoreSpotNow == 1e6` ⇒ case (b),
  cross-block only.

The probe-call tx had to run via `cast send` rather than inside the
forge script body, because foundry's local-simulation EVM doesn't
implement the HyperLiquid spot precompile at `0x...0801` and would
revert the entire script run.

### 15.2 Result — case (b) confirmed

| Field | Value |
|---|---|
| Probe contract | `0x048ebf86a798dBEDCe509D5103E9fc37f5f042dE` |
| Deploy block | 35,390,815 |
| Probe-call tx | `0x206b8b492cfceb3889a3a004e8ceec27c5359ffbda1e654eab653976f0f26ad7` |
| Probe-call block | 35,390,879 |
| Probe-call status | `1 (success)` |
| Probe-call gas | 101,768 |
| `lastIntraReadValue` (post-tx eth_call) | `0` |
| `readCoreSpotNow` (post-tx eth_call) | `1000000` (= 1 USDC, 6-dec) |
| `recoverCore` tx | `0x354abba4cff30a7de21b2a4364e232779c8a6a05f6cfdad8ad7b3a3af1cf2e84` |
| Net unrecoverable cost | 1 USDC (newCoreAccountFee) |

Three events visible in the probe-call receipt: `Approval` (USDC →
CDW), `Transfer` (probe → CDW, 2e6), `Transfer` (probe →
`0x2000…0000`, 2e6 — the synthetic event the bridge emits for
HyperCore). So the bridge fired and the synthetic event was emitted
within-tx, but HyperCore had not processed the event into the
precompile's view at the moment of the immediately-following
precompile read.

### 15.3 Implication for PR 5 commit 3

Decisions 1–11 in `FACTORY_DESIGN_NOTES.md` are unchanged. Only the
wiring inside commit 3 shifts:

- **`CreatorVault.sol`** gains `address public immutable FACTORY` set
  in the constructor (`address(0)` for non-factory deploys), a
  `bool internal _bootstrapped` single-shot flag, and a
  `bootstrapDeposit(address creator, uint256 amount)` external
  function callable only by `FACTORY`. The function bypasses
  `VaultNotActivated`, enqueues the pending bridge for the amount
  already bridged by the factory, and mints shares to `creator`. The
  existing `_doDeposit`'s activation guard skips the precompile check
  if `_bootstrapped == true`.
- **`Factory.sol`'s `createVault`** pulls the creator's stake from
  `msg.sender`, deploys the vault via CREATE2, fires one combined
  bridge of `NEW_CORE_ACCOUNT_FEE_USDC + initialStake` (1 USDC float
  + N USDC stake) to the vault's Core address, then calls
  `vault.bootstrapDeposit(creator, initialStake)`. The 1 USDC is
  consumed as activation fee; N USDC credits to vault Core spot
  cross-block. Atomic from the creator's POV.
- **Non-factory deploys** (e.g., `DeployCreatorVault.s.sol`) pass
  `FACTORY = address(0)`; `bootstrapDeposit` is permanently locked
  and the existing pre-activation runbook applies as before.

No changes to the audit-scope discipline: factory remains a thin
wrapper; the vault stays factory-agnostic except for the single
`bootstrapDeposit` entry point gated by an immutable address check.

---

## 16. PR 5: FACTORY CONTRACT

PR 5 lands the production deployment surface for `CreatorVault`.
Closes `KNOWN_ISSUES.md` §10. Full design in
`../FACTORY_DESIGN_NOTES.md`; this section is the audit-narrative
summary.

### 16.1 Design choices (locked, see FACTORY_DESIGN_NOTES for trade-offs)

| # | Decision | Choice |
|---|---|---|
| 1 | Username scheme | Case-insensitive, 3–30 chars `[a-z0-9_]`, no consec/leading/trailing `_`, ~50 hardcoded reserved names |
| 2 | Atomic creator deposit | Protocol-funded float absorbs 1 USDC activation fee per vault; `createVault` is a single tx |
| 3 | CREATE2 | Salt = `keccak256(factory_addr, creator, lowercase_username)` |
| 4 | Upgradeability | Immutable; v2 via parallel deploy |
| 5 | Admin | Factory `protocolAdmin` (immutable) becomes every vault's admin; no rotation |
| 6 | Events | `VaultDeployed(vault, creator, username, initialStake, sharesMinted, vaultIndex, timestamp)` + `UsernameClaimed(username, vault)` |
| 7 | Vault list | On-chain `address[]` + paginated getter, `limit ≤ 100` |
| 8 | Creation access | Permissionless; `MIN_INITIAL_STAKE = $1000` spam guard |
| 9 | `createVault` atomicity | All-or-nothing tx |
| 10 | View surface | `usernameToVault`, `creatorToVault` (singular), `isUsernameAvailable`, `getVaults`, `isCanonicalVault`, `floatBalance` |
| 11 | Float withdrawal | 7-day timelock (matches stake cap); fund-in immediate; cancel permissionless |

### 16.2 createVault atomic flow

1. `_validateUsernameOrRevert(username)` → `nameHash`.
2. Reject if `creatorToVault[msg.sender] != 0`,
   `initialStake < MIN_INITIAL_STAKE_USDC`, or
   `floatBalance < NEW_CORE_ACCOUNT_FEE_USDC`.
3. `USDC.safeTransferFrom(msg.sender, factory, initialStake)`.
4. CREATE2-deploy vault with salt = `keccak256(factory, creator, nameHash)`.
5. `CDW.depositFor(vault, 1e6 + initialStake, SPOT)` — single combined
   bridge. CDW absorbs 1 USDC fee against the fresh Core account;
   `initialStake` credits cross-block (§15.2).
6. `floatBalance -= 1e6`.
7. `vault.bootstrapDeposit(creator, initialStake)` — mints shares
   against pre-bootstrap NAV (= 0), enqueues `initialStake` (NET,
   not gross) into the in-flight tracker.
8. Write registries, emit `VaultDeployed` + `UsernameClaimed`.

Any step revert unwinds the entire tx (Solidity-default).

### 16.3 PR 5 commit map

| Commit | Hash | Scope |
|---|---|---|
| 0 — design notes | `1fda9fa` | 11 decisions locked |
| 1 — scaffolding | `d80d69b` | Factory.sol skeleton (state, events, errors, stubs) |
| 2 — validation + reserved + uniqueness | `1e7058e` | username validator + GenerateReservedNames script |
| atomic-flow probe | `ce81302` / `e445da0` | Mainnet probe proving case (b) |
| probe-result doc | `796a362` | INVESTIGATION §15 |
| 3a — vault bootstrap | `8ee222c` | FACTORY immutable + `bootstrapDeposit` + guard bypass |
| 3b — factory createVault | `e2722d3` | createVault + vaultSalt + treasuryFundFloat |
| 4 — pagination + views | `caec343` | getVaults with limit ≤ 100, isCanonicalVault, vaultCount |
| 5 — float withdrawal timelock | `b9b29bf` | propose/execute/cancel 7-day, permissionless cancel |
| 6 — coverage sweep | `0539ee3` | 7 access-control + boundary + bypass-isolation tests |
| 7 — docs | this commit | INVESTIGATION §16, KNOWN_ISSUES updates, README factory runbook, GAS_ANALYSIS update |

