# PR 4 design notes — time-locked admin operations

**Status:** decisions locked. Implementation starting.
**Working branch:** `feat/v0.1-pr4-timelocked-admin`
**Predecessor:** PR 3-NEW (in-flight tracker + hardening) — in PR #1.

## Goal

Place admin-controlled state changes that affect user economics behind a
mandatory delay. Closes the trust-narrative gap where a compromised admin
key can immediately raise fees, lower the creator stake cap, or tighten
the per-tx TVL cap to grief users.

## Scope — four functions, two deferrals

In scope (timelocked):
1. `setDepositFee(uint16 bps, address recipient)` — fee economics.
2. `setCreatorStakeCap(uint256 newCap)` — creator skin-in-game floor.
3. `setDepositTvlCapBps(uint16 newBps)` — per-tx TVL cap.
4. `setBuilderFee(address builder, uint64 maxFeeRate)` — trading fee.

Deferred (out of scope, separate work):
- **`Ownable.transferOwnership`** — different operation (handing off the
  admin role itself, not a parameter change). Wrapping OZ's inherited
  fn requires its own propose/execute pattern. Conflating it with
  parametric changes blurs the audit narrative. Target: future PR
  (4.1) or accept indefinitely. Documented in `KNOWN_ISSUES.md`.
- **Builder identity changes** — separate from builder fee. Changing
  which address is the approved builder is a different operation touching
  HL's builder system. Target: defer indefinitely; revisit if production
  ops require it.

## Delays — per-function, not uniform

Different operations have different blast radii. Single 48h constant is
too coarse. Four explicit constants:

```solidity
uint256 public constant FEE_CHANGE_DELAY = 24 hours;
uint256 public constant TVL_CAP_CHANGE_DELAY = 24 hours;
uint256 public constant BUILDER_FEE_CHANGE_DELAY = 24 hours;
uint256 public constant STAKE_CAP_CHANGE_DELAY = 7 days;
```

Rationale:
- **24h** for fee / TVL cap / builder fee: direct economic impact on
  every depositor. Off-chain monitors alert; users have a day to
  deposit/withdraw before the change takes effect.
- **7 days** for stake cap: cap changes can push creators into breach
  state (raising cap from $250K to $1M makes any creator with $260K
  stake suddenly under-capitalized). Creators need real notice to top
  up, regardless of direction.

Explicit per-function constants (not all named `TIMELOCK_DELAY`) make
the audit narrative clean: "different operations have different blast
radii, hence different delays."

## Uniform timelocking — no direction-sensitive paths

**All changes go through propose/execute.** No "lowering = immediate,
raising = timelocked" optimization.

Rejected the direction-sensitive optimization because:
- Encoding "lowering" vs "raising" per parameter adds two code paths
  per function, each needing tests. Audit firm verifies both paths.
- Some directions are ambiguous (raising stake cap — restrictive for
  creators, protective for depositors? Depends on POV).
- Admin mistakes are likely ("forgot the shortcut exists, used the
  slow path").

Simpler model: every parameter change is timelocked at the appropriate
delay. Users get consistent notice. Audit narrative is one sentence:
"all admin parameter changes are timelocked." Admin operations are
slightly slower than they could be — not a real cost; admins rarely
change parameters and 24h isn't onerous for legitimate operations.

## Fee changes — bps + recipient bundled atomically

`proposeDepositFeeChange(uint16 newBps, address newRecipient)` proposes
both fields atomically. Single pending struct, both fields updated on
execute. Rationale:
- The hardening invariant from PR 3-NEW commit 1 (`edd7dde`) says
  `bps > 0 ⟹ recipient != 0` and `bps == 0 ⟹ recipient == 0`. Splitting
  bps and recipient into independent proposals could create transient
  invariant violations during the proposal window.
- Admin almost always wants to change both together or neither.
- Indexer logic is simpler: one event per fee change with both fields.

## Inline state — not OZ `TimelockController`

OZ's `TimelockController` is a general-purpose contract that holds
queued operations and executes after delay. Designed for DAO-style
governance with many distinct operations. Wrong fit for Theorise's case:
one admin, four parameter changes, simple propose/execute.

Inline is simpler:
- No separate contract per vault.
- Admin operations are direct vault calls, not routed through a
  timelock contract.
- Lower gas; less surface area for the audit firm.
- Vault stays self-contained — no external contract coupling for
  parameter changes.

## Stake cap — both-direction timelock

Raising and lowering are both timelocked at 7 days.

Tighten-only would mean "lowering the cap can't hurt anyone" — but it can:
- Cap currently $5M, creator has $5M stake. Admin lowers cap to $1M.
  Required stake drops to $1M. Creator can withdraw $4M without triggering
  breach. Depositors relying on the high stake floor as confidence lose
  that confidence without notice.
- Similar arithmetic for any tightening below current stake levels.

Both-direction timelock means depositors always have 7 days notice
before required-stake levels change. Symmetric, predictable,
audit-friendly. Cost: admin can't quickly lower the cap in an
emergency — acceptable, since emergency stake-cap reductions aren't a
realistic operational scenario.

## In-flight proposal collisions — reject second, explicit cancel

**At most one pending change per parameter at any time.** If admin
attempts to propose while a change is pending for that parameter,
revert `PendingChangeExists()`. Admin must call `cancelPendingX()`
explicitly to abandon a stale proposal.

Rejected alternatives:
- **Silent overwrite** of pending change. Admin might forget they had a
  pending change; surprise on review. Bad UX.
- **Queue multiple proposals.** Overkill for this use case.

Cost: four small `cancelPendingX()` functions, one per parameter.
Each deletes pending state and emits `*Cancelled` event. Trivial.

## State layout

```solidity
struct PendingFeeChange {
    uint16 newBps;
    address newRecipient;
    uint64 executableAt;       // 0 = no pending change
}
PendingFeeChange public pendingFeeChange;

struct PendingStakeCap {
    uint256 newCap;
    uint64 executableAt;
}
PendingStakeCap public pendingStakeCap;

struct PendingTvlCap {
    uint16 newBps;
    uint64 executableAt;
}
PendingTvlCap public pendingTvlCap;

struct PendingBuilderFee {
    address builder;
    uint64 maxFeeRate;
    uint64 executableAt;
}
PendingBuilderFee public pendingBuilderFee;
```

`executableAt == 0` is the sentinel for "no pending change". Propose
sets `executableAt = block.timestamp + delay`. Execute requires
`block.timestamp >= executableAt && executableAt != 0`. Cancel zeros
the struct.

## Events

```solidity
event DepositFeeChangeProposed(uint16 newBps, address newRecipient, uint64 executableAt);
event DepositFeeChangeExecuted(uint16 newBps, address newRecipient);
event DepositFeeChangeCancelled(uint16 newBps, address newRecipient);

event StakeCapChangeProposed(uint256 newCap, uint64 executableAt);
event StakeCapChangeExecuted(uint256 newCap);
event StakeCapChangeCancelled(uint256 newCap);

event TvlCapChangeProposed(uint16 newBps, uint64 executableAt);
event TvlCapChangeExecuted(uint16 newBps);
event TvlCapChangeCancelled(uint16 newBps);

event BuilderFeeChangeProposed(address builder, uint64 maxFeeRate, uint64 executableAt);
event BuilderFeeChangeExecuted(address builder, uint64 maxFeeRate);
event BuilderFeeChangeCancelled(address builder, uint64 maxFeeRate);
```

Indexer computes "pending changes" and surfaces to depositors via UI.

## Errors

```solidity
error TimelockNotElapsed(uint64 executableAt, uint64 currentTime);
error NoPendingChange();
error PendingChangeExists(uint64 executableAt);
```

## Public-ABI changes

The existing immediate setters (`setDepositFee`, `setCreatorStakeCap`,
`setDepositTvlCapBps`, `setBuilderFee`) are **removed** from the
public surface. Replaced by `propose<X>` / `execute<X>` / `cancel<X>`
triples.

No production vaults yet; no migration path required. Factory (PR 8)
deploys post-PR-4 vaults.

## Commit plan

1. **Commit 1 — scaffolding.** State structs, events, errors. Four
   propose, four execute, four cancel functions stubbed (revert
   "unimplemented" or empty bodies). Nothing wired yet. ~80 lines.
2. **Commit 2 — propose logic.** Set pending state, compute
   `executableAt`, emit `*Proposed` events. Reject if pending exists.
3. **Commit 3 — execute logic.** Verify `executableAt` set and reached,
   copy pending → live, delete pending, emit `*Executed` events.
4. **Commit 4 — cancel logic.** Trivial: zero the struct, emit
   `*Cancelled`.
5. **Commit 5 — replace existing setters.** Remove old immediate
   `set<X>` functions; callsites move to the propose/execute flow.
6. **Commit 6 — tests.** 15-20 tests covering propose/execute/cancel
   happy paths, premature execute, no-pending revert, propose-while-
   pending revert, re-propose-after-cancel.
7. **Commit 7 — docs.** INVESTIGATION timelocking section,
   KNOWN_ISSUES updates (deferrals for `transferOwnership` + builder
   identity), README admin operations section.

Smaller than PR 3-NEW. Estimated 2-3 days of focused work.
