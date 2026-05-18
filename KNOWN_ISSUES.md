# KNOWN ISSUES

Documents residual issues in the deployed `CreatorVault` contract that are
intentionally accepted in the current shipped version, with rationale and
target PR / commit for any deferred work.

**Conventions:**
- **CLOSED** = fix shipped; entry retained with forward pointer to the
  closing commit for audit traceability.
- **OPEN — accepted v1** = known behavior; no fix planned; documented
  for integrator awareness.
- **OPEN — deferred** = fix planned; explicit target PR and owner.

---

## 1. Async-bridge sandwich window — **CLOSED in PR 3-NEW commit `84031a1`**

**What (original).** Inside `deposit()`, share pricing read `totalAssets()`
which reflected only Core spot + perp balances. The deposit's USDC was
then bridged to Core via `CoreDepositWallet.depositFor`. Between the
deposit's EVM-side return and Core-side settlement, `totalAssets()` read
stale; it undercounted NAV by the in-flight bridge amount. A subsequent
deposit landing inside the same window priced against the stale NAV but
the post-mint supply — giving the second depositor MORE shares per USDC
than the first.

**Empirical evidence (historical).**
`test_async_two_deposits_same_block_diverge` (PR 2-NEW) showed ≥5%
per-USDC rate divergence when two deposits ran back-to-back with no
settlement between them.

**PR 2-NEW interim mitigation (now retired).** Per-tx TVL cap
(`depositTvlCapBps`, default was 500 bps = 5%). Bounded the maximum
sandwich-lift to the cap fraction. Mechanism retained in PR 3-NEW as
defense-in-depth; **default flipped to `DEPOSIT_TVL_CAP_DISABLED`** in
commit `7f329d3`. Admin can re-enable per-vault.

**Closure.** PR 3-NEW commits `b287f0b` (state) + `84031a1` (wiring)
add `pendingBridgedUsdc` to `totalAssets()`. Subsequent deposits in the
settlement interval price against the post-bridge NAV (which now
includes the in-flight amount). Sandwich window structurally
eliminated for cross-block ordering.

**Verification.** `test_async_two_deposits_same_block_closed_by_tracker`
(was `..._diverge`); `test_sandwich_window_eliminated_by_tracker_under_cap`.
Both assert per-USDC rates match within 1 wei of integer-division rounding.

**Residual.** Same-block intra-tx ordering remains theoretically a
factor (probe 3 didn't test it). Tracker is structurally correct against
it — `pendingBridgedUsdc` is set BEFORE the first state-mutating function
returns, so a follow-up tx in the same block reads the post-deposit NAV.

See `INVESTIGATION_EVM_DEPOSIT.md` §12 for design notes.

---

## 2. Transient false-positive breach state during deposit — **CLOSED in PR 3-NEW commit `84031a1`**

**What (original).** `_updateStakeBreachState()` ran at the end of
`deposit()` after `_mint`. At that moment, `totalSupply` reflected the
new mint but `totalAssets()` did NOT yet reflect the bridged USDC. The
creator's per-share USDC value appeared depressed, and the check
could fire `StakeBreachStarted` for a breach that didn't actually exist.

**Closure.** PR 3-NEW (`84031a1`) wires `_enqueuePending(net)` AFTER
`_bridgeToCore` and BEFORE `_mint` + `_updateStakeBreachState` inside
`_doDeposit`. The breach check now reads `totalAssets()` with the
pending entry included; creator stake reflects post-deposit NAV.

**Verification.** `test_no_transient_breach_event_during_deposit_settlement`
asserts no `StakeBreachStarted` event fires during a follower's large
deposit when creator has comfortable margin above the cap.

**Residual edge case — see §7 below** (1-wei breach-cap-edge for
creators at exactly the cap).

---

## 3. CoreDepositWallet bridge — **VERIFIED (PR 2-NEW + 3 mainnet probes)**

**Status: VERIFIED.** Three empirical mainnet probes (May 12-13) confirm
the CDW bridge credits Core spot end-to-end for a contract caller. See
`INVESTIGATION_EVM_DEPOSIT.md` §12.1 for the consolidated bridge
verification narrative.

**Cross-block settlement: 0 blocks** (probe 3, with pre-fired polling).
Probes 1-2 bounded above at 81 and 90 blocks respectively due to
polling lag.

**Operational consequence: pre-activation runbook.** `deposit()` reverts
`VaultNotActivated` if the vault's Core spot is zero. Admin must
pre-activate by sending ≥2 USDC directly to the vault's Core address.
See README "Deployment runbook."

**Re-verification trigger.** Run `contracts/script/MainnetBridgeProbe.s.sol`
from a throwaway EOA after material changes to the bridge mechanism
(CDW upgrades, Circle USDC implementation upgrades, network changes).
Not required for every vault deployment under unchanged conditions.

---

## 4. Donation hand-off via `sweepStrandedEvmUsdc` is permissionless — **OPEN — accepted v1**

**What.** Anyone can call `sweepStrandedEvmUsdc()`. The function bridges
any USDC the vault holds on EVM to its Core spot account, then enqueues
a pending entry (PR 3-NEW commit `84031a1` adds the `_enqueuePending`
call to keep the tracker accounting consistent).

**Why permissionless.** The only outcome is "vault gains assets", which
enriches all shareholders proportionally. No attack surface; a malicious
caller can only help.

**Attack analysis (PR 3-NEW context).** An attacker who wants to inflate
`pendingBridgedUsdc` by X must actually move X USDC into the vault.
Post-sweep, that X belongs to the vault. The next `_settlePending` call
after Core settles drains pending by X. Net: attacker paid X to briefly
inflate the tracker; vault gained X permanently. Worst exchange rate for
the attacker; benign for the protocol.

**Risk:** none. Permissionless calling is the design, not a bug.

---

## 5. `newCoreAccountFee` is 1 USDC, not 0 — **OPEN — accepted v1 (operational)**

**What.** Circle's `CoreDepositWallet` charges a one-time 1 USDC
`newCoreAccountFee` on the first inbound bridge to a fresh Core account
(empirical: mainnet probe 1, May 12).

**Mitigation.** `deposit()` reverts `VaultNotActivated()` if the vault's
Core spot is zero. Admin pre-activates per the README runbook.

**Residual cost.** 1 USDC per vault deployment, paid by the admin during
pre-activation. Treated as deployment overhead.

**Risk:** none for users (guard catches first-deposit case at the EVM
boundary). Operational only.

---

## 6. Per-tx TVL cap floor — **OPEN — accepted v1 (default now off)**

**What.** When the per-tx TVL cap is enabled, it has a hardcoded floor
of `MIN_DEPOSIT_USDC` ($10). When `5% × NAV < $10` (i.e., NAV < $200),
the effective cap is `$10`. Above NAV $200, the cap binds normally.

**Why.** Bootstrap UX. Without the floor, an admin re-enabling the cap
at a small NAV would block every legitimate deposit.

**Default change in PR 3-NEW (`7f329d3`).** Cap defaults to
`DEPOSIT_TVL_CAP_DISABLED`. Floor is irrelevant in the common case.
When admin re-enables the cap, the floor applies as described.

**Risk:** none. Floor is permissive (loosens rather than tightens the
cap at small NAV); only effect is admin can't set a cap effectively
below $10 at bootstrap, which is a non-issue post-activation.

---

## 7. 1-wei breach-cap-edge — **OPEN — accepted v1 (UI affordance)**

**What.** A creator who deposits exactly at the cap (`creatorStakeCapUsdc`,
default $250K) can transiently flip into `StakeBreachStarted` on any
subsequent state change due to integer-floor rounding in
`convertToAssets`. Specifically: creator stake reads as `cap - 1 wei`
versus required = `cap` → breach fires by 1 wei.

**Self-healing.** Any positive NAV change (new deposit, profitable
trade) recomputes the creator's stake above the cap. Breach state clears
on the next `_updateStakeBreachState` call.

**Observed in tests.** `test_no_transient_breach_event_during_deposit_settlement`
was originally designed at exactly-the-cap; the test was redesigned to
use $300K (clearly above $250K cap) so the post-dilution stake has
comfortable margin and the test verifies the tracker fix without
catching this rounding edge.

**Mitigation options considered.**
- (a) **Document and accept** — current choice. UI suggests creators
  deposit slightly above the cap (e.g., 1 USDC headroom). Indexer
  alerts suppress single-block `StakeBreachStarted` / `StakeBreachCured`
  pairs.
- (b) Adjust threshold check to allow a small tolerance (≤1 wei) below
  the cap. Adds complexity for marginal UX improvement. **Indefinitely
  deferred; revisit only if production observation shows the rounding
  edge bites real users.**

**Risk:** very low. Self-healing; no funds at risk; UI and indexer
debounce eliminate the user-visible noise.

---

## 8. `totalAssets()` staleness window — **OPEN — accepted v1 (integrator awareness)**

**What.** Between bridge settlement (Core balance grows) and the next
state-mutating tx (which calls `_settlePending`), `totalAssets()` reads
slightly inflated values: the settled amount is counted twice (once in
`coreSpot`, once in `pendingBridgedUsdc`). Drains on the next
`_settlePending` call.

**Impact on share math: none.** Every state-mutating function calls
`_settlePending()` at entry, so internal pricing always sees the
correct NAV. The staleness affects only external reads via the public
`totalAssets()` view.

**Impact on external readers (UI / indexers).** A read between
settlement and the next state-mutating call sees inflated NAV.
Magnitude bounded by `pendingBridgedUsdc` (recent deposit amounts).
Window bounded by inter-tx latency (typically <60s on active vaults).

**Mitigation options considered.**
- (a) Make `totalAssets()` self-healing: compute pending dynamically
  by observing Core growth in the view path. Adds compute to every view
  call; not gas-bounded for the share-math callers (they re-do the work
  on entry anyway).
- (b) **Document and push to integrators** — current choice. UI
  displays "estimated NAV" with a refresh affordance; indexers
  debounce on state-mutating events rather than view polling.
- (c) **Indefinitely deferred** — revisit option (a) only if
  integrators report the staleness materially affecting UX
  (e.g., share-price displays oscillating).

**Risk:** low. Internal share math is unaffected; only the public view
reads stale. Magnitude bounded by recent deposit amount; window bounded
by inter-tx latency.

**See also:** README "Integration notes for UI and indexer."

---

## 9. Redeem outflow lag — **OPEN — deferred (no current PR)**

**What.** `_spotSendCore` (called inside `redeemCore`) fires CoreWriter
action 6 (`spotSend`), which is async. Core spot balance doesn't drop
until HyperCore processes the action — typically same block, but
asynchronous from the EVM tx's perspective. During this lag,
`totalAssets()` over-counts: the burned shares are gone, but the
outgoing USDC is still on Core.

**Symmetric to KNOWN_ISSUES §2 in the opposite direction.** Pre-PR 3-NEW
this was already present (Core balance also lagged on redemptions). PR
3-NEW does not address it; the tracker tracks deposit-side inflows only.

**Impact.** Brief NAV over-count window after redemptions. Next
depositor in the window prices against slightly inflated NAV → gets
slightly fewer shares than fair. Magnitude bounded by recent redemption
amount; window bounded by HyperCore settlement (effectively 0 blocks
per probe 3, but unverified for spotSend specifically).

**Deferred.** Potential `inFlightFromRedeem` mechanism (symmetric to
`inFlightFromPerp`) would track expected outflows and adjust
`totalAssets()` accordingly. **Not in current PR backlog.** Revisit if
production monitoring shows the over-count materially affecting share
pricing for concurrent deposits.

**Risk:** low. Symmetric direction to the (now-closed) deposit-side
window; magnitude bounded by recent redemption amount; window bounded
by HyperCore settlement (empirically 0 blocks). Concurrent
deposit pricing skew within this window is the only user-visible
effect, and it's biased *against* the next depositor by a tiny amount
— not catastrophic, not exploitable.

---

## 10. Factory contract scope gap — **OPEN — deferred (target PR 8)**

**What.** Production deployment requires a factory contract for
single-call vault creation, username uniqueness enforcement
(case-insensitive, locked at deploy), reserved-name list,
`VaultDeployed` event emission for the indexer, and atomic creator
initial-stake deposit at deploy time. **No factory exists yet.**

**Current state.** `CreatorVault.sol`'s constructor accepts creator,
admin, and `coreDepositWallet` directly. `DeployCreatorVault.s.sol`
deploys one vault per script run with the deployer as creator/admin
by default. Sufficient for testing and audit; insufficient for
production multi-vault deployment.

**Target.** PR 8 (separate scope), to land prior to audit engagement.

**Auditor note.** PR 3-NEW's audit scope is the vault contract itself.
The factory will be a separate file with its own audit scope. The
vault's constructor is intentionally factory-agnostic (no
factory-specific roles or hooks); the factory will be a thin wrapper
that handles name registration + vault deployment.

**Risk:** none for the vault contract itself. The factory gap is a
deployment-tooling gap, not a contract-safety gap. Vaults deployed
without the factory are functionally identical; the factory adds
indexer-friendly events + name-registry constraints.

**Next-up priority.** Factory is on the critical path between
"contract PRs complete" and "audit firm engaged + UI work startable."
Start immediately after PR 4 merges.

---

## 11. `transferOwnership` is immediate (not timelocked) — **OPEN — deferred (target PR 4.1 or future work)**

**What.** PR 4 places `setDepositFee`, `setCreatorStakeCap`,
`setDepositTvlCapBps`, and `setBuilderFee` behind a propose/execute
delay. `Ownable.transferOwnership` (inherited from OZ) is **not**
timelocked; an `onlyOwner` caller can hand off the admin role
immediately to any address.

**Why deferred.** `transferOwnership` is a different kind of operation
(admin role handoff, not parametric). Wrapping it requires either
overriding the inherited fn with its own propose/execute pattern or
moving to `Ownable2Step` plus a custom delay. Conflating it with PR 4's
parametric scope blurs the audit narrative. Treated as separate work.

**Risk.** Compromised admin key can immediately transfer ownership
away (or to a controlled address). PR 4's parametric timelocks bound
the *parametric* abuse window but not this. Mitigated operationally:
admin key handling (multisig / hardware wallet) is the primary control.

**Target.** PR 4.1 (own scope) or accept indefinitely. Revisit when
the multi-sig / role separation story is designed (likely tied to
the factory work in PR 8).

**Risk:** medium if admin key compromise is in scope; otherwise low.
Off-chain mitigation (multisig / hardware wallet) is the practical
control. PR 4's parametric timelocks bound the value an attacker can
extract by changing fees, but not the ownership transfer itself.

---

## 12. Builder identity changes are not timelocked — **OPEN — accepted v1**

**What.** `executeBuilderFeeChange` (PR 4) fires
CoreWriter action 13 (`approveBuilderFee`) with the
`(builder, maxFeeRate)` tuple. The `maxFeeRate` parameter is timelocked;
the `builder` address parameter rides along with it in the same
proposal. So *changing which address is the approved builder* uses the
same 24h delay as a fee change.

**Why this is fine.** The proposed design treats `builder` and
`maxFeeRate` as a single tuple. Admin proposing a change to either
field starts the 24h timer. There's no separate "fast path" for
builder-identity-only changes that would bypass the delay.

**What's *not* timelocked.** Switching to an entirely different
builder address requires going through `proposeBuilderFeeChange` with
both fields. This is correct and intentional — the delay applies.

**Residual.** None. This entry exists to confirm the design covers the
case, so the auditor sees that `builder` identity isn't a back door.

**Risk:** none. The propose/execute path enforces the 24h delay
regardless of which field is being changed in the tuple.
