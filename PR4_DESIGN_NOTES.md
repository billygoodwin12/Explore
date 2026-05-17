# PR 4 design notes — time-locked admin operations

**Status:** draft for review. Not implemented.
**Working branch:** `feat/v0.1-pr4-timelocked-admin`
**Predecessor:** PR 3-NEW (in-flight tracker + hardening) — already in PR #1.

## Goal

Place admin-controlled state changes that affect user economics behind a
mandatory delay. Closes the trust-narrative gap where a compromised admin
key can immediately raise fees, lower the creator stake cap, or tighten
the per-tx TVL cap to grief users.

## Scope — which admin functions get timelocked?

| Function | Effect on users | Direction-sensitive? | Recommend |
|---|---|---|---|
| `setDepositFee(bps, recipient)` | Bps>0 → users pay fee per deposit | **Yes** — raising hurts users, lowering helps | Timelock raises only (or any change to recipient). Lowering bps + clearing fee = immediate. |
| `setCreatorStakeCap(newCap)` | Affects creator's required stake | **Yes** — lowering can push creator into breach; raising tightens skin-in-game | Timelock both directions. Either direction can grief either the creator or users. |
| `setDepositTvlCapBps(newBps)` | Tightening (lower bps) can DOS users | **Yes** — tightening hurts users, loosening / disabling helps | Timelock tightens only. Loosen / `DEPOSIT_TVL_CAP_DISABLED` = immediate. |
| `setBuilderFee(builder, maxFeeRate)` | Affects trading economics | **Yes** — raising max fee hurts users via worse trade execution; lowering helps | Timelock raises only. |

**Out of scope (intentionally):**
- `Ownable.transferOwnership` — out-of-band admin transition. Adding a
  timelock to this complicates emergency rotation. **Open for discussion.**
- `nonReentrant` is not config; no timelock needed.
- `_settlePending`, `_enqueuePending` are internal; no timelock needed.
- `moveOnCore`, `placeOrder`, `setBuilderFee.builder` (when builder is
  fresh): these are creator-day-to-day operations, not admin config
  changes affecting depositor economics. Builder *fee* is timelocked
  above; builder *identity* could be timelocked too — flagged for review.

## Delay length

**Recommend: 48 hours (172,800 seconds).**

Industry convention:
- Compound, MakerDAO: 48h-7d
- Aave: 24h-7d
- Curve: 48h-7d
- Synthetix: 48h

48h gives depositors time to redeem if they object to a pending change.
Shorter delays (24h) are common for emergency tightening (e.g., security
patches); longer (7d) for permissionless governance. Theorise is
single-admin, so a single delay value is cleaner.

**Configurable?** No. Hardcoded constant in the contract. Reasoning:
- Configurable delay = "admin can set delay to 1 second then make any
  change immediately." Defeats the purpose unless the delay-change
  itself is timelocked, which adds complexity.
- Per-vault customization is not required at this stage.
- Auditor-friendly: single number, easy to reason about.

**Constant:**
```solidity
uint256 public constant ADMIN_TIMELOCK_DELAY = 48 hours;
```

## Architecture — inline vs separate `TimelockController`

**Recommend: inline.** Per-function `pending` storage + `propose` /
`execute` / `cancel` pattern.

**Rationale:**
- OZ `TimelockController` is heavyweight: scheduling arbitrary calls
  with arbitrary calldata. We only need 4 specific admin functions to
  be timelocked. Over-general.
- Separate controller adds a deployment step per vault (or shared
  controller introduces shared-admin coupling we don't want).
- Inline state is cheap (1 storage slot per pending param) and gives
  us tight, function-specific error types.
- Factory deployment in PR 8 stays simple — no additional contract
  to wire.

**Cost:** Each timelocked function gets a `pending<X>` struct and three
new fns (`propose<X>`, `execute<X>`, `cancel<X>`). ~120 lines per fn ×
4 = ~480 lines added. Acceptable.

## Symmetric direction-sensitive pattern

For each direction-sensitive function, two paths:

1. **Immediate path** (`set<X>` retained): allowed only for changes
   that benefit users (lower fee, looser cap, raise stake cap).
2. **Timelocked path** (`propose<X>` + `execute<X>` + `cancel<X>`):
   required for changes that hurt users.

Boundary enforced in `set<X>` itself — revert
`AdminChangeRequiresTimelock(newValue, currentValue)` if the change is
in the "hurts users" direction.

**Trade-off:** `setDepositFee` has two axes (bps + recipient). A change
that lowers bps but switches recipient could be construed as
manipulative. **Recommend: any recipient change requires timelock,
regardless of bps direction.**

## State layout

```solidity
struct PendingFeeChange {
    uint16 bps;
    address recipient;
    uint64 executableAt;       // 0 = no pending change
}
PendingFeeChange public pendingDepositFee;

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

Each `proposeXyz` overwrites the slot (admin can re-propose, restarting
the timer). `cancelXyz` zeros the slot. `executeXyz` requires
`block.timestamp >= executableAt && executableAt != 0`.

## Events

```solidity
event DepositFeeChangeProposed(uint16 bps, address recipient, uint64 executableAt);
event DepositFeeChangeExecuted(uint16 bps, address recipient);
event DepositFeeChangeCancelled(uint16 bps, address recipient);
// ...analogous for stake cap, TVL cap, builder fee
```

Indexer can compute "pending changes" and surface to depositors via UI.

## Errors

```solidity
error AdminChangeRequiresTimelock(uint256 newValue, uint256 currentValue);
error TimelockNotElapsed(uint64 executableAt, uint64 currentTime);
error NoPendingChange();
error PendingChangeMismatch(/* proposed vs execution args */);
```

## Test surface

- Propose → wait → execute happy path (per fn).
- Propose → cancel → state unchanged.
- Execute before delay → revert.
- Execute with no pending → revert.
- Re-propose restarts timer.
- Immediate path allowed for benign direction; reverts for hostile direction.
- Owner change (`Ownable.transferOwnership`) does **not** clear pending
  changes — new owner inherits them. (Or: does. Open question, flag for
  review.)
- Pending changes survive `Pausable` if we add one in a later PR (out of scope).

## Migration path for existing deployments

PR 4 changes the public ABI of `set<X>` functions (some paths now revert
with `AdminChangeRequiresTimelock`). For vaults deployed pre-PR-4:
- N/A. No production vaults yet. All deployments will be post-PR-4.

For the factory (PR 8): factory will deploy PR-4-version vaults.

## Decisions surfaced for review (before implementation)

1. **Scope confirmation:** the 4 functions listed (`setDepositFee`,
   `setCreatorStakeCap`, `setDepositTvlCapBps`, `setBuilderFee`). Anything
   else? `transferOwnership`? Builder *identity* change?
2. **Delay = 48h constant.** Acceptable?
3. **Direction-sensitive immediate vs timelocked.** Acceptable, or
   prefer "all changes timelocked" (simpler audit narrative, worse UX
   for benign changes)?
4. **`setDepositFee`:** any recipient change = timelocked. Acceptable?
5. **Inline state vs OZ TimelockController.** Inline recommended.
6. **`setCreatorStakeCap`:** timelock both directions, or only
   tightening direction? Lowering the cap can put existing creator
   into breach — this is hostile-by-default. Recommend both directions.

## Next concrete steps after review

1. Commit 1: state layout + events + errors (no logic changes).
2. Commit 2: propose / execute / cancel for `setDepositFee`.
3. Commit 3: propose / execute / cancel for `setCreatorStakeCap`.
4. Commit 4: propose / execute / cancel for `setDepositTvlCapBps`.
5. Commit 5: propose / execute / cancel for `setBuilderFee`.
6. Commit 6: docs (KNOWN_ISSUES, README admin runbook updates).
