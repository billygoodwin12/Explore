# PR 5 design notes — factory contract

**Status:** decisions locked. Ready to implement.
**Working branch:** `feat/v0.1-pr5-factory`
**Predecessor:** PR 4 (time-locked admin operations) — in PR #2.

## Goal

Production deployment requires a factory contract for single-call vault
creation, username uniqueness enforcement (case-insensitive, locked at
deploy), `VaultDeployed` event emission for the indexer, and atomic
creator initial-stake deposit at deploy time. Closes
`KNOWN_ISSUES.md` §10.

This is the gate between "contract PRs complete" and "audit firm
engaged + UI work startable."

## Locked decisions

Eleven decisions. Original eight from the design pass + three added
during review (atomic semantics, view surface, float-withdrawal
timelock).

---

### Decision 1 — Username scheme + reserved list

Case-insensitive uniqueness via lowercase normalization. ASCII
alphanumerics + underscore. Length **3–30** (not 32: most social
platforms cap below this; usernames appear in URLs, share tickers,
ERC-20 token names, OG cards, and 30 keeps headroom for themed
suffixes if needed later). Reserved-name list hardcoded in factory
constructor, ~50 names sized once at deploy.

Username validator enforces, in order:
- length 3–30
- regex equivalent: `^[a-z0-9_]+$` (after lowercasing input)
- no consecutive underscores (prevents `___bill___` Discord-spam style)
- no leading or trailing underscore
- not in reserved list

Storage:
- `mapping(bytes32 => address) usernameToVault` keyed by
  `keccak256(lowercase(name))`.
- `mapping(address => string) usernameDisplay` for the original casing
  (UI surface).
- `mapping(bytes32 => bool) isReserved` keyed by
  `keccak256(lowercase(name))`.

**Open item.** If any handles longer than 30 chars have been promised
out-of-band, raise to 32 and document. None known at notes-time —
staying at 30.

---

### Decision 2 — Atomic creator deposit at deploy, protocol-funded float

Factory absorbs the 1 USDC `newCoreAccountFee` per deployment from a
factory-held USDC float (framed as "protocol operational expense" —
admin tops up; treasury-funded). `createVault` is a single tx, all-or-
nothing.

**Flow:**
1. Factory pulls 1 USDC from its own `usdcFloat` balance, bridges to
   the new vault's Core spot address (consumed as activation fee →
   vault Core spot reaches 0 + 1 USDC fee absorbed → next bridge
   credits normally).
2. Factory pulls creator's stake from creator's EVM address (via
   pre-existing USDC `approve`).
3. Factory deploys the vault via CREATE2.
4. Factory approves the freshly deployed vault to spend the stake and
   calls `vault.deposit(stake, creator)`. Vault's deposit pulls the
   stake, bridges it, mints shares to creator.
5. Factory emits `VaultDeployed` (+ `UsernameClaimed`, see decision 6).

If any step reverts, the whole tx reverts atomically — no partial
state where a vault exists but isn't initialized (see decision 9).

**Factory float surface:**
- `treasuryFundFloat(uint256 amount)` — admin tops up the float.
  **Immediate, not timelocked** (adding assets is never grief).
- `floatBalance() public view returns (uint256)` — read for
  monitoring + UI alerts.
- `proposeFloatWithdrawal(address to, uint256 amount)` /
  `executeFloatWithdrawal()` — admin drains unused float, gated by
  7-day timelock (see decision 11). Same delay as stake cap (both are
  protocol-asset withdrawals).
- `FloatExhausted(uint256 have, uint256 need)` — revert on `createVault`
  when float < 1 USDC.

**Operational mitigation for float exhaustion.** UI / indexer monitors
`floatBalance()` and alerts admin to top up. Documented in README
factory runbook. Suggested top-up cadence: in batches of 100 USDC
(= ~50 vaults of headroom).

**Sizing.** At 10,000 vaults the cumulative protocol cost is ~$10K
in activation fees — rounding error against launch costs. Creator UX
is clean: deposit `N` USDC, get shares backed by `N` USDC.

---

### Decision 3 — CREATE2 with factory-versioned salt

CREATE2 with salt =
`keccak256(abi.encodePacked(address(this), creator, lowercase(username)))`.

Including the factory's own address in the salt ensures that if the
factory is ever redeployed, salts across old + new factories don't
collide. (Without the factory address, CREATE2's determinism would
produce the same vault address from the same `(creator, username)`
pair across factory versions, which is exactly the wrong property
when v1 + v2 factories coexist.)

Vault constructor is already CREATE2-compatible: takes creator, admin,
CDW as explicit args; no `msg.sender`-dependent init.

OZ's `Create2.deploy` helper handles the low-level deploy + address
prediction.

---

### Decision 4 — Immutable factory

No upgradeability. If a bug is found in the factory post-launch,
remediation = deploy a new factory, migrate. Existing vaults are
unaffected (their bytecode is immutable). New vault deployments happen
through the new factory; old + new factories coexist.

**Documented in KNOWN_ISSUES §13 (new).** Migration path: indexer
follows both factories; UI reads from both; username registry stays
canonical on v1 unless v2 imports v1's registry via constructor arg.
Acceptable for v1 at small AUMs.

**Revisit trigger.** If any single vault holds >$10M, upgradeability
becomes the right answer (beacon-proxy `CreatorVault.sol` with
multi-day timelock for upgrades). Not for v1.

---

### Decision 5 — Immutable factory `protocolAdmin`; admin rotation NOT supported

Factory has `protocolAdmin` set at deploy (immutable). Every vault
deployed by the factory is created with `admin = factory.protocolAdmin`.
Creator is `msg.sender`.

Admin rotation is **intentionally not supported**, on either the
factory or the per-vault admin. Reasons:
- Rotation primitive doesn't solve admin-compromise problem: a
  compromised admin can pre-emptively rotate to attacker-controlled
  key before discovery.
- Per-vault rotation surface scales linearly with N vaults — high
  audit cost, no real benefit.
- The previous-relayer-design rotation pattern (`proposeRelayerRotation` /
  `executeRelayerRotation`) was removed when the relayer was removed.
  Don't reintroduce it here.

**Documented in KNOWN_ISSUES §14 (new).** Operational mitigation:
admin key held in cold storage / multi-sig / hardware-backed key, not
a hot wallet. Compromised admin = factory migration (per decision 4),
not in-place rotation.

---

### Decision 6 — `VaultDeployed` + `UsernameClaimed` events

```solidity
event VaultDeployed(
    address indexed vault,
    address indexed creator,
    string username,
    uint256 initialStake,
    uint256 sharesMinted,
    uint256 vaultIndex,
    uint256 timestamp
);

event UsernameClaimed(string username, address vault);
```

`VaultDeployed` fields:
- `vault` — indexed, primary key.
- `creator` — indexed, for "vaults by creator" queries.
- `username` — original casing (not lowercased) for display. Not
  indexed (dynamic strings would be hash-indexed, defeating purpose);
  off-chain code filters via `usernameToVault` lookup.
- `initialStake` — creator's deposit at create time.
- `sharesMinted` — shares credited to creator.
- `vaultIndex` — position in the on-chain `vaults` array. Lets
  indexers reconcile pagination without re-deriving from event order.
- `timestamp` — `block.timestamp`. (No `block.number` — redundant with
  timestamp for sorting on HyperEVM's deterministic block cadence.)

`UsernameClaimed` is a separate, dedicated event for indexers tracking
the username namespace independently. Redundant data vs `VaultDeployed`,
trivial to emit, decouples username-registry indexers from vault
indexers.

---

### Decision 7 — On-chain `vaults` array + paginated getter, page limit 100

`address[] public vaults` + `mapping(address => bool) isCanonicalVault`.

Paginated getter:
```solidity
function getVaults(uint256 offset, uint256 limit)
    external view returns (address[] memory);
```
Hard limit `limit <= 100` per call. RPC view calls under HyperEVM
block-gas-limit at any reasonable vault count. UI requests pages of
50 by default.

Storage cost: ~20K gas per vault one-time SSTORE (~$0.001 at HL
prices). At 10K vaults that's $10 of cumulative protocol cost —
negligible.

**Re-evaluation trigger.** Not storage-bound; gas-on-read-bound. At
100K+ vaults, indexer-only becomes the right answer. The on-chain
array would become a legacy artifact ignored by the indexer.

---

### Decision 8 — Permissionless `createVault` with `MIN_INITIAL_STAKE` spam guard

Anyone can call `createVault(string username, uint256 initialStake)`
for themselves, paying gas. **No allowlist, no admin approval.**

**Spam guard:** `MIN_INITIAL_STAKE_USDC = 1000e6` ($1,000). The
creator must put up ≥$1K of their own USDC to claim a username +
vault. Reasoning:
- Without a minimum, 1,000 spam vaults cost the protocol $1,000 of
  float-fee. With $1K minimum, the spam attacker must front $1M of
  real capital. Economics flip.
- $1K is low enough to be accessible (creators with real intent
  comfortably clear it) and high enough to bound the spam vector.
- Revisit if production observation shows the floor is too high
  (creators dropping off pre-deposit) or too low (residual spam).

Constant on the factory, not per-vault — applies uniformly at create
time. (Vault's `MIN_DEPOSIT_USDC = 10e6` is independent and applies to
subsequent follower deposits; it's a share-precision floor, not a
spam floor.)

**Known operational issue (KNOWN_ISSUES §15 new).** Username
squatting via $1K-stake vaults is still possible (someone with $100K
can claim 100 desirable usernames). Acceptable for v1; out of scope to
solve here. Potential v2 mitigations (per-creator vault cap, dispute
resolution, decay-on-inactivity) noted for future work.

---

### Decision 9 — Atomic `createVault` semantics

`createVault` is a single transaction with all-or-nothing semantics.
If any step reverts (username collision, float exhausted, USDC
approve insufficient, vault `deposit` reverts, CREATE2 fails), the
entire tx reverts.

**Why this matters.** Without atomicity, a partial-failure mode could
leave a deployed-but-not-initialized vault, registered-but-empty
username, or charged-but-not-credited creator. Single-tx semantics
prevent all of these.

**Implementation note.** Solidity reverts unwind state; the only
non-atomic primitive in scope is the CoreWriter `sendRawAction` (which
is fire-and-forget). The factory deliberately avoids any "send action
and continue" pattern — every Core-side change in `createVault` flows
through the vault's own `deposit`, which is already audited.

Tested via failure-injection tests in commit 6 (mock CDW reverts, mock
USDC reverts, username collision mid-tx).

---

### Decision 10 — View functions (factory lookup surface)

```solidity
function usernameToVault(string memory username)
    external view returns (address);
function creatorToVault(address creator)
    external view returns (address);
function isUsernameAvailable(string memory username)
    external view returns (bool);
function getVaults(uint256 offset, uint256 limit)
    external view returns (address[] memory);
function isCanonicalVault(address vault)
    external view returns (bool);
function floatBalance()
    external view returns (uint256);
```

`usernameToVault` accepts the user's input casing (lowercases
internally), returns `address(0)` if unclaimed.

`creatorToVault` is **singular**, not plural — one vault per creator
per design (decision 8). If decision changes to multi-vault per
creator later, the signature breaks ABI for indexers; flagged as
constraint.

`isUsernameAvailable` is a UI convenience: returns `true` iff the
username passes validation, isn't reserved, and isn't claimed. Single
call replaces three.

`isCanonicalVault` is a safety check for clients: "is this address
really a factory vault, or a lookalike?" Useful for indexer
deduplication and UI trust signals.

---

### Implementation note (commit 3) — within-tx Core credit visibility unverified

The atomic `createVault` flow (decisions 2 + 9) assumes that
within-transaction the precompile reads at `_coreSpotUSDC()` see the
Core credit produced by an earlier `CoreDepositWallet.depositFor` call
in the **same transaction**. This is unverified empirically: the third
mainnet probe measured **cross-block** settlement (sub-block from a
separate `cast call`'s vantage), not same-tx visibility.

Two possible outcomes:

- **(a) Within-tx credit visibility works.** Factory's
  `_bridgeFromFloat` (step 3) credits the vault's Core spot; vault's
  `deposit` (step 6) calls `_coreSpotUSDC()` and sees it as nonzero;
  `VaultNotActivated` guard passes; atomic flow succeeds as designed.
- **(b) Cross-tx-only credit visibility.** Step 6's `_coreSpotUSDC()`
  reads zero (credit not yet propagated within the same tx); `deposit`
  reverts `VaultNotActivated`; entire `createVault` reverts.

**Verification before merging commit 3.** Deploy a throwaway probe on
mainnet that mimics the factory flow: call `CDW.depositFor` then
immediately call the spot precompile in the same tx. Confirm the read
sees the credit. ~$1-2 cost, definitive answer.

**Fallback if verification shows (b).** Add a factory-only bootstrap
entry point on the vault (e.g., `bootstrapDeposit` that skips the
`VaultNotActivated` guard for `msg.sender == factory`). Adds one
function to the vault's audit surface but unblocks the atomic flow.
Decisions 1-11 unchanged; only the wiring inside commit 3 shifts.

This isn't a decision change — it's an implementation-level
prerequisite for commit 3. Decisions stay locked.

---

### Decision 11 — Float withdrawal timelock (7 days)

`withdrawFloat` is a protocol-asset withdrawal operation; matches the
risk profile of stake-cap changes. Use the same 7-day propose/execute
pattern from PR 4.

```solidity
struct PendingFloatWithdrawal {
    address to;
    uint256 amount;
    uint64 executableAt;
}
PendingFloatWithdrawal public pendingFloatWithdrawal;

uint256 public constant FLOAT_WITHDRAWAL_DELAY = 7 days;

function proposeFloatWithdrawal(address to, uint256 amount) external onlyAdmin;
function executeFloatWithdrawal() external onlyAdmin;
function cancelPendingFloatWithdrawal() external onlyAdmin;

event FloatWithdrawalProposed(address to, uint256 amount, uint64 executableAt);
event FloatWithdrawalExecuted(address to, uint256 amount);
event FloatWithdrawalCancelled(address to, uint256 amount);
```

Same `PendingChangeExists` / `TimelockNotElapsed` / `NoPendingChange`
error surface from PR 4 (factory imports / redeclares as needed). At
most one pending withdrawal at a time.

`treasuryFundFloat` (admin adding USDC) remains **immediate** — adding
assets is never grief.

---

## Out of scope (deferred, with explicit framing)

- **Username transfers between addresses.** Locked at deploy. Adds
  significant complexity around share-token retitling. Defer
  indefinitely.
- **Multi-vault per creator.** Each creator → one vault. A given EOA
  can re-deploy by paying a new minimum stake under a new username,
  but the canonical `creatorToVault` mapping holds one. Product
  question, not contract question. Defer.
- **Vault pause / decommission — flagged operationally.** No
  admin path exists (or will exist in v1) to forcibly retire an
  inactive vault. Documented framing for KNOWN_ISSUES §16:

  > "If a creator becomes inactive, the vault continues to operate
  > indefinitely. Followers can always redeem; creator can always
  > redeem (subject to stake-floor cure period). There is no admin
  > path to forcibly retire a vault. This is a deliberate design
  > choice — admin doesn't have unilateral power to retire user
  > funds. Vaults effectively self-retire as creator and followers
  > all redeem to zero."

  Defensible for v1. Auditors and creators will ask; the answer is
  prepared.
- **Username changes after deploy.** Permanent. Surface in creator
  onboarding UI: "This is permanent — choose carefully." No contract
  support.

---

## Commit plan

1. **Commit 1 — scaffolding.** `Factory.sol`: state vars, structs,
   events, errors, function signatures with empty bodies. No logic.
   ~120 lines.
2. **Commit 2 — username validation + reserved list + uniqueness
   storage.** Pure-function validator (length, charset, underscore
   rules), reserved-list check, `usernameToVault` /
   `usernameDisplay` writes. Independently testable.
3. **Commit 3 — `createVault` implementation.** CREATE2 deploy,
   factory-funded pre-activation bridge, creator stake pull + vault
   `deposit`, registry writes, `VaultDeployed` + `UsernameClaimed`
   event emission. Atomic by construction.
4. **Commit 4 — view functions + pagination.** `getVaults` with
   `limit ≤ 100`, `isCanonicalVault`, `isUsernameAvailable`,
   `creatorToVault`, `floatBalance`.
5. **Commit 5 — float management + timelocked withdrawal.**
   `treasuryFundFloat` (immediate), `proposeFloatWithdrawal` +
   `executeFloatWithdrawal` + `cancelPendingFloatWithdrawal` with
   7-day delay. Mirrors PR 4's propose/execute pattern.
6. **Commit 6 — tests.** Username validation (length, charset,
   underscore rules, reserved-list, collision), CREATE2 determinism
   (compute address client-side, compare), full `createVault` happy
   path (factory deposit → vault deposit → shares minted), atomic
   failure cases (USDC pull reverts, CDW reverts, username collision
   mid-tx), `FloatExhausted` revert, paginated getter (offset / limit
   / out-of-range), float withdrawal timelock state machine,
   permissionless creation, `MIN_INITIAL_STAKE` enforcement,
   `isCanonicalVault` truthy + falsy. Estimated 25-30 tests.
7. **Commit 7 — docs.** `INVESTIGATION_EVM_DEPOSIT.md` §15 (factory
   design + commit map), `KNOWN_ISSUES.md` updates (§10 closure,
   §13 factory migration path, §14 admin rotation deferral, §15
   username squatting, §16 vault decommission framing), README
   factory runbook + float top-up runbook, `GAS_ANALYSIS.md` update
   for `createVault` gas.

Seven commits. About 2 days of focused work.

---

## Quick reference

| # | Decision | Locked answer |
|---|---|---|
| 1 | Username scheme | Case-insensitive, 3-30 chars `[a-z0-9_]`, no consec/leading/trailing `_`, hardcoded ~50 reserved |
| 2 | Atomic creator deposit | Protocol-funded float absorbs 1 USDC activation fee per vault; `createVault` is single tx |
| 3 | CREATE2 | Salt = `keccak256(factory_addr, creator, lowercase_username)` |
| 4 | Upgradeability | Immutable; v2 via parallel deploy |
| 5 | Admin | Factory `protocolAdmin` (immutable) becomes every vault's admin; no rotation |
| 6 | Events | `VaultDeployed(vault, creator, username, initialStake, sharesMinted, vaultIndex, timestamp)` + `UsernameClaimed(username, vault)` |
| 7 | Vault list | On-chain `address[]` + paginated getter, `limit ≤ 100` |
| 8 | Creation access | Permissionless; `MIN_INITIAL_STAKE = $1000` spam guard |
| 9 | `createVault` atomicity | All-or-nothing tx; any revert unwinds everything |
| 10 | View surface | `usernameToVault`, `creatorToVault` (singular), `isUsernameAvailable`, `getVaults`, `isCanonicalVault`, `floatBalance` |
| 11 | Float withdrawal | 7-day timelock (matches stake cap); fund-in is immediate |

Ready to start commit 1 on confirmation.
