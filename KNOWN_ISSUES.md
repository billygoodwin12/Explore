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

## 3. CoreDepositWallet bridge — verified on mainnet (PR 2-NEW)

**Status: VERIFIED.** Two empirical mainnet probes on May 12 confirm
the CDW bridge credits Core spot end-to-end for a contract caller.
See `INVESTIGATION_EVM_DEPOSIT.md` §11 for the data.

Key findings from the probes:
- First-time bridge to a fresh Core account loses **1 USDC** to
  Circle's `newCoreAccountFee` (the Phase 3 agent had claimed this fee
  was 0; empirically wrong).
- Steady-state bridges to an already-activated account credit 1:1
  with no further deduction.
- Settlement latency upper bound: ≤92 blocks (~92 seconds). Actual
  latency is likely much shorter — both probes credited before the
  first poll could measure precisely.

**Operational consequence.** PR 2-NEW now enforces `VaultNotActivated()`
in `deposit()`: a fresh vault rejects user deposits until admin has
pre-activated by sending ≥2 USDC directly to the vault's Core spot.
See README "Deployment runbook" for the operator steps.

**Residual operational risk.** A fresh deployment that skips the
pre-activation runbook will revert every user deposit at the EVM
boundary. No funds at risk; UX blocked until admin runs the step.

**Re-verification before every new vault.** Run
`contracts/script/MainnetBridgeProbe.s.sol` from a throwaway EOA after
material changes to the bridge mechanism (CDW upgrades, Circle USDC
implementation upgrades, network changes). Not required for every
vault deployment under unchanged conditions.

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

---

## 5. `newCoreAccountFee` is 1 USDC, not 0 (PR 2-NEW)

**What.** Circle's `CoreDepositWallet` charges a one-time 1 USDC
`newCoreAccountFee` on the first inbound bridge to a fresh Core account.
The Phase 3 agent inferred from CDW source that this fee was 0 on
mainnet; empirically false (mainnet probe May 12 — see
`INVESTIGATION_EVM_DEPOSIT.md` §11.1, Finding A).

**Impact.** Without mitigation, the first depositor's deposit silently
loses 1 USDC: share math computes against the gross amount but Core
credits only `amount - 1 USDC`. Subsequent depositors are diluted by
that 1 USDC shortfall.

**Mitigation.** `deposit()` reverts with `VaultNotActivated()` if the
vault's Core spot is zero. Admin must pre-activate by sending ≥2 USDC
directly to the vault's Core address (HyperLiquid UI / `usdSend`)
before the vault accepts any user deposit. See README "Deployment
runbook".

**Residual cost.** 1 USDC per vault deployment, paid by the admin
during pre-activation. Treated as deployment overhead.

---

## 6. Per-tx TVL cap floor (PR 2-NEW)

**What.** The per-tx TVL cap (`depositTvlCapBps`, default 500 = 5%)
has a hardcoded floor of `MIN_DEPOSIT_USDC` ($10). When `5% × NAV <
$10` (i.e., NAV < $200), the cap is `$10`. Above NAV $200, the cap
binds normally at 5%.

**Why.** A freshly pre-activated vault has NAV = $1 (after the
1 USDC activation fee). Without the floor, the 5% cap would be
$0.05, below `MIN_DEPOSIT_USDC`, blocking every deposit. The floor
makes bootstrap deposits possible without admin sending a large
pre-activation amount.

**Trade-off.** Below NAV $200, the cap doesn't bound the sandwich
window as tightly as 5%. In the worst case (NAV ≈ $200, first
follower deposit = $10), the deposit is `$10 / $210 ≈ 4.76%` of
post-deposit NAV — close to the 5% intent. Acceptable.
