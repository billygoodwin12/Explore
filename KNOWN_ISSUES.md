# KNOWN ISSUES

Documents residual issues in the deployed `CreatorVault` contract that are
intentionally accepted in the current shipped version, with rationale and
the next-version plan to address them.

---

## 1. Async-bridge sandwich window (PR 2-NEW)

**What.** Inside `deposit()`, share pricing reads `totalAssets()` which only
reflects Core spot + perp balances. The deposit's USDC is then bridged to
Core via `CoreDepositWallet.depositFor`. Core credit settles asynchronously
(HyperCore observes the bridge event a few blocks later). Between the
deposit's EVM-side return and Core-side settlement, `totalAssets()` reads
stale: it undercounts NAV by the in-flight bridge amount.

A subsequent deposit landing inside the same window prices against the
stale NAV but the post-mint supply — giving the second depositor MORE
shares per USDC than the first.

**Empirical evidence.** `test_async_two_deposits_same_block_diverge` in
`contracts/test/CreatorVault.t.sol` shows ≥5% per-USDC rate divergence
when two deposits run back-to-back with no settlement between them.

**Interim mitigation.** Per-tx TVL cap (`depositTvlCapBps`, default 500
bps = 5%). Bounds the maximum lift a sandwich attacker can capture to
roughly the cap fraction. Admin-tunable inside [1%, 100%]; sentinel
`DEPOSIT_TVL_CAP_DISABLED = type(uint16).max` allows full disable when
PR 3-NEW's proper fix lands.

**Permanent fix (PR 3-NEW).** In-flight bridge tracker:
- Track each pending bridge (amount + timestamp) in contract state.
- Include `pendingBridgedUsdc` in `totalAssets()` so share pricing sees
  the correct NAV during the settlement window.
- Decay pending entries either time-based (after N seconds) or by
  observing Core balance increases that match pending amounts.
- Edge cases to handle carefully: interleaved redemptions, creator
  `moveOnCore` calls (perp ↔ spot rebalancing), and trade-settlement
  Core balance changes that are unrelated to bridge settlement.

This is real design work, not a 5-line change. Deferred to PR 3-NEW to
let PR 2-NEW ship with a defensible bounded-loss mitigation now.

---

## 2. Transient false-positive breach state during deposit (PR 2-NEW)

**What.** `_updateStakeBreachState()` runs at the end of `deposit()` after
`_mint`. At that moment, `totalSupply` reflects the new mint but
`totalAssets()` does NOT yet reflect the bridged USDC (it's in flight).
This depresses the creator's per-share USDC value, and `_updateStakeBreachState`
may flag a breach that doesn't actually exist.

**Impact.** Bounded. The breach state self-heals on the next state-mutating
call (subsequent deposit, redeem, or trade), which re-evaluates against
fresh `totalAssets()`. The only operational impact is a brief window
during which `isInBreach()` reads `true` for what should be a non-breach.

**Permanent fix.** Same as #1 — the in-flight tracker fixes both
simultaneously, because the breach check would see the corrected NAV.

**Why not addressed in PR 2-NEW.** Same as #1: the proper fix is real
design work. The transient state self-heals; no fund loss; no permanent
state corruption.

---

## 3. CoreDepositWallet bridge mechanism not empirically verified end-to-end (PR 2-NEW)

**What.** PR 2-NEW's `deposit()` uses Circle's `CoreDepositWallet.depositFor`,
proven canonical via Phase 3 of the bridge-verification protocol
(Monetrix, hyper-evm-lib, and Circle's own CCTP forwarder all use this
pattern; mainnet CDW handles 450K+ txs / $1.27B). We verified the pattern
is canonical and that mainnet CDW is heavily used.

We have NOT yet verified end-to-end that a contract callable from THIS
specific vault contract triggers a Core spot credit. The Foundry mainnet
fork test only verifies the EVM-side call doesn't revert; the fork cannot
observe HyperCore state.

Three prior rounds of `depositFor` on testnet (May 9) silently failed to
credit Core. Cause not fully understood — likely a testnet-specific issue,
but not definitively ruled out for mainnet.

**Mitigation before deployment.** Run `contracts/script/MainnetBridgeProbe.s.sol`
from a fresh, throwaway EOA with $5-10 of real USDC on mainnet. Confirm
the probe's Core spot balance reads non-zero after the bridge. ~$1-2
cost in gas + USDC, ~30 min including recovery. See INVESTIGATION_EVM_DEPOSIT.md
§9-§10 for the full protocol.

**Status.** Mandatory before any production deployment of PR 2-NEW.

---

## 4. Donation hand-off via `sweepStrandedEvmUsdc` is permissionless (PR 2-NEW)

**What.** Anyone can call `sweepStrandedEvmUsdc()`. The function bridges
any EVM USDC balance the vault holds to its Core spot account.

**Why permissionless.** The only outcome is "vault gains assets", which
enriches all shareholders proportionally. There's no attack surface from
making it permissionless — a malicious caller can only help.

**Edge case.** If an attacker monitors mempool, they could front-run a
large donation to `sweepStrandedEvmUsdc` and follow with a deposit before
the sweep's bridge settles. Same sandwich window as #1; same per-tx TVL
cap applies. Bounded.
