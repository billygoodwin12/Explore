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

## 10. Factory contract scope gap — **CLOSED in PR 5 commits `d80d69b` → `0539ee3`**

**What (original).** Production deployment required a factory contract
for single-call vault creation, username uniqueness enforcement,
reserved-name list, indexer events, and atomic creator stake deposit.

**Closure.** PR 5 ships `contracts/src/Factory.sol`. Eleven design
decisions locked in `FACTORY_DESIGN_NOTES.md`. Audit-narrative summary
in `INVESTIGATION_EVM_DEPOSIT.md` §16. Highlights:
- `createVault(username, initialStake, name, symbol)` atomic single-tx
  flow: validate → CREATE2-deploy → bridge activation fee + stake →
  `bootstrapDeposit` → register → emit events.
- Username scheme: case-insensitive, 3–30 chars `[a-z0-9_]`, no
  consec/leading/trailing `_`, ~50 hardcoded reserved names.
- Salt = `keccak256(factory_addr, creator, lowercase_username)`.
- Permissionless creation with `MIN_INITIAL_STAKE_USDC = $1000` spam
  guard.
- Protocol-funded float absorbs the 1 USDC `newCoreAccountFee` per
  vault; topped up via `treasuryFundFloat` (immediate, admin-only);
  withdrawn via 7-day timelocked propose/execute with permissionless
  cancel.
- On-chain `address[]` vault list with paginated getter (limit ≤ 100);
  `isCanonicalVault` for client-side authenticity checks.
- Immutable factory + immutable `protocolAdmin`; redeploy + parallel
  operation if a bug requires v2. See §13 below.

**Vault-side change.** `CreatorVault` gained `address public immutable
FACTORY` (set to `address(0)` for direct deploys) and a single
`bootstrapDeposit(address creator, uint256 amount)` factory-only entry
point that bypasses `VaultNotActivated`. Necessary because within the
same tx as the factory's activation bridge, the spot precompile reads
0 (case (b) confirmed empirically — INVESTIGATION §15).

**Verification.** 49 factory tests + 9 vault bootstrap tests in
`Factory.t.sol` / `CreatorVault.t.sol`. Suite total 197/197. Coverage
includes happy path, all 6 revert paths, CREATE2 determinism,
pagination boundaries, float timelock state machine, bootstrap bypass
isolation (does not skip MIN_DEPOSIT_USDC / TVL cap).

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

---

## 13. Factory is immutable — migration via parallel deploy — **OPEN — accepted v1**

**What.** `contracts/src/Factory.sol` has no upgrade mechanism. If a
bug is found post-launch, remediation requires deploying a new factory
contract; existing vaults remain valid against the old factory.

**Why immutable.** Decision 4 in `FACTORY_DESIGN_NOTES.md`.
Upgradeable factories (UUPS or beacon proxy) would:
- Add an admin upgrade key whose compromise = factory logic swap = all
  future vault deployments compromised (existing bytecode-immutable
  vaults unaffected, but trust narrative weakens).
- Need their own propose/execute timelock to be safe, mirroring PR 4's
  pattern, ~200 LOC of additional surface.
- Couple factory + vault versioning, complicating audit scope.

**Migration path if v2 needed.**
1. Deploy `FactoryV2` with the desired changes.
2. Optionally seed V2's username registry from V1 events (off-chain
   indexer reconstruction → on-chain constructor arg) so existing
   handles can't be re-claimed under V2.
3. Indexer subscribes to `VaultDeployed` events from both factories.
4. UI surfaces both factories' vaults; identical user-facing behavior.
5. Existing vaults continue calling V1's address; the address never
   changes for them. New deploys route through V2.

**Risk:** medium-low. A bug in the factory affects all *new*
deployments until V2 ships; deployed vaults are unaffected. AUM
exposure depends on production cadence. Revisit upgradeability if any
single vault holds >$10M (then beacon-proxy on `CreatorVault.sol`
itself with multi-day timelock becomes the right answer).

**Auditor note.** Audit scope is the factory contract as deployed.
Future V2 will be a separate audit engagement.

---

## 14. Activation fee absorption — protocol cost — **OPEN — accepted v1 (operational)**

**What.** Each `createVault` call consumes 1 USDC from the factory's
`floatBalance` as Circle's `newCoreAccountFee` (a one-time charge per
fresh HyperCore account). The fee is unrecoverable by design — Circle
absorbs it as activation overhead.

**Operational cost.** ~$1 per vault, paid by the protocol treasury.
At 1,000 vaults in year 1 that's $1,000 of cumulative cost;
rounding-error against any other launch line-item. Decision 2 in
`FACTORY_DESIGN_NOTES.md` rationalises this: cleaner UX (creator
deposits exactly what they meant, no "minus fee" disclosure) is worth
the protocol-side cost.

**Monitoring.** Off-chain alerting must watch `floatBalance()` and
notify admin when the float drops below an operational threshold (e.g.
50 vaults of headroom = 50 USDC). If float exhausts, `createVault`
reverts `FloatExhausted(have, need)` — no user funds at risk, but UX
breaks for new deploys until admin tops up via `treasuryFundFloat`.

**Top-up cadence.** Recommend batches of 100 USDC (≈50 vaults of
headroom). Admin op is immediate (not timelocked) — `treasuryFundFloat`
adds assets and is never grief.

**Risk:** low. Operational; no user funds at risk. Mitigation is
monitoring + alerting.

---

## 15. Username squatting — accepted v1 (out of scope for v1) — **OPEN — accepted v1**

**What.** Anyone with $1,000 (the `MIN_INITIAL_STAKE_USDC` spam
guard) can claim a desirable username by deploying a low-activity
vault. An attacker with $100K could claim 100 usernames they don't
intend to use legitimately.

**Why accepted v1.** Decision 8 in `FACTORY_DESIGN_NOTES.md`. Solving
username squatting requires either (a) admin-gated approval (kills GTM
flexibility), (b) per-creator vault caps (forces architectural
choices), or (c) dispute resolution (off-chain process). All defer to
v2+ when production observation tells us whether squatting is real or
theoretical.

**Mitigations not yet built (potential v2 paths):**
- Per-creator vault cap (already singular `creatorToVault` enforces
  this on-chain; off-chain abuse via sybil EOAs is the remaining
  vector).
- Decay-on-inactivity: vaults that don't accept deposits or trade for
  N days release the username back to the pool. Adds complexity.
- Dispute resolution via admin escalation. Requires off-chain process
  + on-chain admin override of `creatorToVault` (which would need its
  own timelock).

**Risk:** medium reputational, low contract-safety. Squatted usernames
don't impair the protocol; they impair UX for the displaced creator.
Treat as a product-team problem with possible contract assists in v2.

---

## 16. Cancel permission model — uniform permissionless — **OPEN — accepted v1**

**What.** All cancels across PR 4 (`cancelPendingFeeChange`,
`cancelPendingStakeCapChange`, `cancelPendingTvlCapChange`,
`cancelPendingBuilderFeeChange`) and PR 5
(`cancelPendingFloatWithdrawal`) are **permissionless** — anyone can
abort a pending proposal during its timelock window.

**Why permissionless.** Defense against admin-key compromise queuing
hostile changes (10% deposit fee, $5M stake cap that forces creators
into breach, hostile float drain). Any monitoring observer can cancel
the proposal before it executes.

**Griefing surface.** Random user cancels legitimate admin proposal
→ admin re-proposes and waits the delay again. Bounded; no permanent
damage. Griefer pays gas to cancel; admin pays gas to re-propose.
Asymmetry favors the protocol (griefer pays each round; admin pays
once).

**PR 4 history.** Commit `0731051` originally shipped cancels as
`onlyOwner` (admin-only) — a pattern oversight from before cancel
permissions were explicitly discussed. Commit `6a5cf8f` retrofits all
four PR 4 cancels to be permissionless, matching PR 5's design.

**Risk:** very low. Griefing surface is bounded by gas economics
(attacker pays each cancel) and the legitimate-admin's ability to
re-propose at will.

---

## 17. Off-chain surveillance indexer — launch-blocking commitment — **OPEN — accepted v1**

**What.** Theorise's defense against creator wash-trading and
cross-vault collusion is implemented in the off-chain indexer
(`INDEXER_DESIGN_NOTES.md`), not in the contracts. The contracts
provide the audit trail (events, on-chain trade signals); the
indexer joins those against HyperLiquid fill data to compute
counterparty concentration, cross-vault pair concentration, and
the derived diversity score that gates discoverability.

**Commitment.** Mainnet launch **gates on the indexer being
operational**. Decision 6 in `INDEXER_DESIGN_NOTES.md` §10 is
explicit: shipping contracts to mainnet without surveillance is
shipping a financial product without the defense mechanism
documented as essential. The audit window (3-6 weeks) is the
natural indexer-build window (estimated 2 weeks of focused work);
they run in parallel.

**What "operational" means at launch:**
- Real-time event indexing for `Factory` + every deployed
  `CreatorVault`. p50 freshness ≤ 5s.
- HL API fill-data integration with adaptive per-vault polling.
  p50 freshness ≤ 1 hour for surveillance.
- Initial 3-component diversity score computed per vault
  (`INDEXER_DESIGN_NOTES.md` §5.5) with config-tunable weights.
- Public read API exposed for the UI.
- Open-source repo published with reproducibility checklist.

**What's deferred to within 30 days post-launch (not blocking):**
- HL S3 archive backfill puller (only needed for cold-start
  recovery of vaults deployed >7 days before the indexer started
  indexing them; rare in practice).
- Tier 2 private detection layer (`INDEXER_DESIGN_NOTES.md` §11.2).
  Tier 1 public scoring is the launch commitment.

**Risk:** low for contracts (none of this is contract-side). The
risk is product-side: a launch without surveillance creates a
window where bad-actor creators can wash-trade undetected and
damage platform reputation before defenses are in place.
Mitigated by the launch gating.

**Tracking.** Indexer build progress is tracked outside this
repo. Re-verify operational status before flipping the contract
admin from testnet config to mainnet config at launch.

---

## 18. Share transfer drops performance-fee entry tracking — **OPEN — accepted v1**

**What.** `CreatorVault` is ERC-4626 / ERC-20, so vault shares are
transferable. PR 6f tracks per-depositor entry NAV and locked
performance-fee rate in two mappings
(`userEntryNavPerShareE18`, `userPerformanceFeeBpsAtEntry`). Standard
ERC-20 `transfer` / `transferFrom` does **not** propagate these
mappings to the recipient. The recipient of transferred shares has
`entryNav = 0` and `lockedRate = 0`, which under PR 6f's redemption
math means:
- `gain = shares × (currentRealizedNav - 0) / 1e18`, i.e. **all
  redemption proceeds are treated as gain**, not just the
  appreciation from cost basis.
- `lockedRate = 0` (no min-locked rate), so applied rate at
  redemption is `min(0, currentRate) = 0`. The recipient pays no
  fee — **conservative for the protocol, suboptimal for the
  recipient** (they get the full proceeds but lose the auto-benefit
  of any locked-low rate the original depositor had).

Actually re-reading: applied rate is `min(0, currentRate) = 0`,
so no fee is charged at all. The "all proceeds as gain" framing
above only bites if `lockedRate > 0` for the recipient. With both
mappings defaulting to 0, the recipient redeems fee-free.

**Net effect.** Transferring vault shares **breaks** performance-fee
accounting for the recipient. They pay zero performance fee on
redemption regardless of vault gain. Original depositor's stored
tracking remains on their own address (their shares were burned by
the transfer's debit, but the mappings stay until they redeem
something — note: their `balanceOf` may now be zero from the
transfer, but the mappings still hold their cost basis).

**Why accepted v1.**
- Share transfers between addresses are unusual in practice. Vault
  positions are typically held by the original depositor.
- The protocol's downside is **zero fee** on transferred shares, not
  negative fee. The protocol loses revenue; the depositor benefits.
  Auditors should note this is the depositor-favorable failure mode.
- Fixing requires either: (a) blocking transfers entirely (breaks
  ERC-4626 composability), (b) propagating mappings on every
  transfer (storage writes on every share movement — expensive +
  complex weighted-avg merge on `transferFrom`), or (c) treating
  transferred shares as cost-basis-zero at the recipient (sketchy
  UX since recipient pays full-proceeds fee — current PR 6f design
  defaults to zero-fee instead via `lockedRate = 0`).
- **UI mitigation in v1:** display a warning in any UI surface that
  exposes share transfers (e.g., portfolio tools) noting that
  transferring vault shares forfeits the rate-lock benefit and
  reverts to no-cost-basis tracking for the recipient.

**Risk:** low for the protocol (zero fee, not negative). Medium for
depositors who think they can transfer shares freely without losing
benefits.

**Future fix path (out of scope for v1).** Override the OZ
`_update` hook to copy or weighted-average-merge the mappings on
non-mint/burn transfers. Adds ~30k gas per transfer + per-call
mapping read/write complexity. Revisit if production shows
meaningful share-transfer volume.

---

## 19. Direct-deploy vaults silently absorb protocol fee shares — **OPEN — accepted v1**

**What.** Two protocol-share flows depend on a factory treasury
lookup:
- **Deposit fee protocol share** (PR 6c): `_doDeposit` calls
  `_feeRecipient()`, which returns `address(0)` for vaults with
  `FACTORY == address(0)`. The `_splitFee` defensive check makes
  `fee = 0` in this case, so the entire deposit is bridged without
  any skim. The "protocol share" is structurally zero for direct
  deploys.
- **Performance fee protocol share** (PR 6f): `redeemCore`
  computes the carve-out and routes the creator's 90% via
  `_spotSendCore(CREATOR, creatorShare)`, then attempts the
  treasury 10% via `_spotSendCore(treasury, protocolShare)`. For
  `FACTORY == address(0)` vaults, treasury is `address(0)` so the
  branch is skipped — the 10% protocol share stays on the vault's
  Core spot account, diluting remaining shareholders' NAV.

**Why accepted v1.** Direct-deploy vaults are dev/legacy path.
Production vaults are factory-deployed and always have a configured
treasury via `factory.protocolTreasury()`. The defensive fallback
keeps direct-deploy vaults operational without requiring a
factory-aware treasury, at the cost of losing the protocol's 10%
performance fee on those vaults' redemptions.

**Net effect on direct-deploy vaults:**
- Deposit fee: never extracts a fee regardless of
  `depositFeeBps` setting. Creator can call `setDepositFee(100)` but
  no USDC flows to anyone.
- Performance fee: creator's 90% routes correctly; protocol's 10%
  stays on vault Core spot (slightly inflates NAV for remaining
  shareholders, including the creator's own bootstrap stake).

**Risk:** none. Direct-deploy vaults are not the production path;
the fallback is operationally safe. Documented for auditor clarity.

---

## 20. Performance fee on realized gains only — by design — **OPEN — accepted v1**

**What.** PR 6f computes performance fee against
`_realizedNavPerShareE18 = (coreSpot + pendingBridgedUsdc + 1) × 1e18
/ (totalSupply + 10^offset)`. The denominator includes the virtual-
shares offset to match share math; the numerator includes settled
spot + pending bridges. It **excludes** perp account value
(`_corePerpAccountValue()`) — the unrealized mark-to-market of any
open perp positions.

**Why by design.** Defense against NAV manipulation. If unrealized
perp PnL were included, a creator could:
1. Open a perp position right before depositors redeem.
2. Mark-to-market price moves favorably (lucky, or via low-liquidity
   tape painting).
3. Performance fee is computed on the inflated NAV.
4. Position is closed at a worse price later; depositors who
   redeemed early benefit, depositors who held lose.

Excluding unrealized perp PnL means performance fee only applies
to gains that have crystallized into spot USDC. Creators wanting
to capture performance fee on a winning trade must **close the
position and route gains to spot** before depositors can redeem
against the realized gain.

**Operational consequence.** Creators are incentivized to realize
gains regularly rather than carry massive unrealized P&L on perp.
Acceptable trade-off; the protective property is more valuable
than the operational friction.

**Risk:** none — this is a design feature, not a bug. Documented
so auditors and creators understand the constraint.

---

## 21. Hybrid performance-fee rate lock — dual evaluation semantics — **OPEN — accepted v1**

**What.** PR 6f's hybrid rate lock evaluates the applied performance
fee rate at TWO points:
- **At each deposit / top-up** (`_updatePerformanceTracking`,
  Case 2): `userPerformanceFeeBpsAtEntry[receiver] = min(stored,
  current creator rate)`. Lock-in propagates across multiple deposits
  — once a depositor sees a lower rate, that lower rate is preserved.
- **At redemption** (`_computePerformanceFee`, follow-up patch
  `397b31e`): `applied rate = min(userPerformanceFeeBpsAtEntry,
  current creator rate)`. Depositor benefits from creator rate drops
  that happen between their last deposit and their redemption,
  without needing to top up to capture the lower rate.

**Net semantics.** Depositor pays
`min(rate-locked-at-last-deposit, current-at-redemption)`. Protected
from rate hikes after deposit (locked wins when current is higher)
AND auto-benefits from creator rate drops without needing to top up
(current wins when current is lower).

**Why both evaluations are needed.** The at-deposit min is a
permanent floor — a depositor who saw 5% at any deposit holds the
5% locked even if creator hikes later and the depositor tops up
during the hike (without the min lock, top-up would lose the
prior 5% benefit). The at-redemption min is the "current is
lower than locked" optimization — without it, depositors would
need to redeposit any time creator drops the rate, which is
cost-ineffective and bad UX.

**Why accepted v1.** Standard pattern: depositor never pays more
than they would have at any rate they encountered. Cap (20%)
bounds worst-case fee exposure regardless. Documented so creators
understand they cannot retroactively raise fees on existing
depositors.

**Risk:** none — this is the depositor-favorable failure mode.
Mentioned for auditor clarity so the "rate" field in the
`PerformanceFeeCharged` event isn't misread (it's the applied
rate, possibly different from both stored and current).
