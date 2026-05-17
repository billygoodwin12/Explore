# PR 5 design notes — factory contract

**Status:** draft for review. Not implemented.
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

## Decisions surfaced for review (before implementation)

Eight decisions. Each has a recommendation, rationale, and the
alternatives I considered with their trade-offs.

---

### Decision 1 — Username uniqueness, normalization, reserved list

**Recommendation:** Case-insensitive uniqueness via lowercase
normalization at registration. ASCII alphanumerics + underscore.
Length **3–32**. Reserved-name list hardcoded in factory constructor,
~50 names sized once at deploy.

**Sub-decisions:**

- **Normalization.** Store the user-supplied original casing for
  display in a `usernameDisplay[vault]` mapping, but key the
  uniqueness check on the lowercased version: `usernameToVault[
  lowercase(name)]`. UI shows the original casing; collisions detected
  on lowercase.
- **Allowed characters.** `[a-z0-9_]` (case-insensitive). Reject
  unicode (homoglyph attacks), hyphens (UX ambiguity with URLs),
  leading/trailing underscore (style consistency).
- **Length.** Min 3 (avoid "a" / "x" single-char squat), max 32 (gas
  efficiency + URL safety).
- **Reserved list.** Hardcoded `bytes32[] memory reserved` in
  constructor; stored as `mapping(bytes32 => bool) isReserved` keyed
  by `keccak256(lowercase(name))`. ~50 names covering: protocol
  identifiers ("theorise", "admin", "support", "team"), common
  offensive words, single-letter "i" / "u" type squats.

**Alternatives considered:**
- *Admin-managed reserved list (add/remove fns).* Adds admin powers
  that should themselves be timelocked. More complexity for marginal
  benefit; reserved list rarely needs runtime updates. Rejected.
- *Bloom filter / merkle root for compact reserved-list storage.*
  Useful at 1000s of names; overkill at 50. Rejected.
- *Mixed-case uniqueness ("Alice" and "alice" both valid).* Invites
  user confusion + impersonation. Rejected.

**Open sub-question for you:** is the 32-char max too tight for any
creator personas you've already promised to (longer brand names)?

---

### Decision 2 — Atomic creator initial stake deposit at deploy

**Recommendation:** Factory absorbs the 1 USDC `newCoreAccountFee`
per deployment from a factory-held USDC float. `createVault` is a
single tx that: deploys vault → bridges 2 USDC from factory's float
to vault Core (1 consumed as fee, 1 settles → vault activated) →
pulls creator's stake → calls `vault.deposit(stake, creator)` →
emits `VaultDeployed`. Creator gets shares atomically, no exposure
to the activation-fee mechanic.

**Why factory funds the fee.** Two practical options:
- (a) Creator absorbs the 1 USDC fee themselves. Their initial stake
  is `N`, but only `N - 1` ends up backing shares. Slightly
  user-hostile, exposes the implementation detail.
- (b) Factory absorbs the 1 USDC fee from a protocol-funded float.
  Clean creator UX; ongoing protocol cost = $1 × N_vaults.

At Theorise's vault count (low 1000s in year 1), $1000-ish of
cumulative activation fees is rounding error against any other
operational cost. (b) is cleaner.

**Funding model.** Factory has a `usdcFloat` balance, topped up by
admin via `topUpFloat(uint256 amount)`. `createVault` reverts
`FactoryFloatInsufficient(have, need)` if float < 2 USDC. Admin's
runbook: monitor float, top up in batches of, say, 100 USDC (=50
vaults of headroom).

**Alternatives considered:**
- *Two-step deploy + activate + deposit, separate txs.* Matches
  current operational flow but creator has to wait for admin to
  pre-activate. Poor UX. Rejected.
- *Vault constructor changes to bypass `VaultNotActivated` for the
  factory caller.* Adds factory-aware code paths to the vault, which
  the audit-scope-discipline says no. Rejected. The vault stays
  factory-agnostic; the factory does the pre-activation by bridging
  before depositing.

**Open sub-question for you:** is `2 USDC` per vault from a
protocol-funded float acceptable as ongoing overhead, or would you
prefer the simpler creator-absorbs-fee path?

---

### Decision 3 — CREATE2 vs CREATE

**Recommendation:** CREATE2, with salt =
`keccak256(creator_address, lowercase(username))`. Vault addresses
become deterministic and computable client-side before tx confirms.

**Why CREATE2:**
- Indexer can compute the canonical vault address from
  `(creator, username)` without watching `VaultDeployed`.
- UI can show "your vault will be deployed at `0xABC…`" during the
  creation flow.
- Easy to verify a claimed vault is the factory's canonical output
  for a given (creator, username) pair — no spoofing risk.

**Cost:** marginal gas overhead (~32k vs CREATE), one extra hashing
op. Trivial against the rest of `createVault`.

**Constraint surfaced.** Constructor cannot use `msg.sender`-dependent
initialization (CREATE2's deterministic address assumes deterministic
init code). The current vault constructor takes creator + admin +
CDW as explicit args; passes already.

**Alternatives considered:**
- *CREATE (nonce-based).* Address depends on factory's nonce;
  unpredictable without an `eth_call` against the factory. Rejected.
- *CREATE2 with sequential nonce as salt.* Loses the
  "(creator, username) → address" determinism. Rejected.

---

### Decision 4 — Factory upgradeability

**Recommendation:** **Immutable factory.** Future improvements deploy
a new factory contract; existing vaults remain valid; indexer follows
both factories.

**Why immutable.** Upgradeable factories require either UUPS or
Transparent proxy, both of which:
- Add a `_implementation` slot, proxy admin, and upgrade flow to audit.
- Introduce another admin power that should itself be timelocked,
  adding propose/execute scaffolding to the factory mirroring PR 4.
- Risk: admin key compromise = factory logic swap = all future
  vault deployments compromised. Existing deployed vaults are
  unaffected (their bytecode is immutable), but the trust narrative
  weakens.

If we need a v2 factory with new features, deploy alongside v1.
Vaults from each are valid; the indexer subscribes to both factories'
`VaultDeployed` events. Username registry in v1 stays canonical;
v2 either imports v1's registry via constructor arg (read-only) or
manages its own namespace.

**Alternatives considered:**
- *UUPS with timelocked upgrade.* Complete pattern; audit-acceptable
  but adds substantial surface area. Rejected for v1.
- *Diamond pattern (EIP-2535).* Even more complex. Hard pass.

---

### Decision 5 — Admin role propagation

**Recommendation:** Factory has a `protocolAdmin` set at deploy
(immutable). Every vault created by the factory is deployed with
`admin = factory.protocolAdmin`. Creator is `msg.sender` (the trader
opening their own vault).

**Why centralized admin.** Theorise's trust model:
- Creator = the trading user. Has `onlyCreator` controls on
  `moveOnCore`, `placeOrder`. Day-to-day operator.
- Admin = the protocol entity. Has `onlyOwner` (timelocked) controls
  on fee / cap / TVL cap / builder fee.

The admin is *not* the creator. It's the Theorise protocol team /
multi-sig / treasury operator. Single key (or multisig) covering all
vaults is consistent with this model and matches the existing
single-admin assumption in PR 4's timelock design.

**Compromise consideration.** A single admin key compromise affects
every vault — but each parametric change is bounded by the PR 4
timelock (24h / 7d). And the off-chain mitigation (multisig /
hardware wallet) is the practical primary control. Distributing admin
per-vault wouldn't help: if the creator is the admin, creators have
to learn fee management and timelock ops, which is bad UX.

**Alternatives considered:**
- *Creator = admin per-vault.* Decentralizes risk but offloads
  protocol-level decisions (fee structure, builder approval) to each
  creator. Bad UX, bad ops. Rejected.
- *Per-vault admin specified at `createVault` call.* Adds optionality
  with no clear use case. Rejected.

**Open sub-question for you:** is the immutable `protocolAdmin` on
the factory acceptable, or do you want a path to rotate it (which
itself would need to be timelocked — adds factory surface area)?

---

### Decision 6 — `VaultDeployed` event surface

**Recommendation:**

```solidity
event VaultDeployed(
    address indexed vault,
    address indexed creator,
    string username,
    uint256 initialStake,
    uint256 sharesMinted,
    uint256 timestamp
);
```

Fields rationale:
- `vault` — primary key, indexed.
- `creator` — for "vaults by creator" queries, indexed.
- `username` — for username → vault lookup. Not indexed (dynamic
  strings can't be indexed efficiently); indexer reads the data field.
- `initialStake` — the creator's deposit amount at create time.
  Indexer surfaces this as "seeded with X USDC."
- `sharesMinted` — the share count credited to the creator. Useful
  for "initial share price" indicator.
- `timestamp` — `block.timestamp`. Indexer can use this for
  chronological sorting without re-querying the chain.

`block.number` is redundant with `timestamp` for sorting on HyperEVM
(deterministic relationship); skip it.

**Alternatives considered:**
- *Emit only `(vault, creator)` minimal event; indexer reconstructs
  the rest from logs.* Forces indexer to do extra calls. Modest gas
  saving on factory side; not worth it.
- *Add `salt` and `vaultBytecodeHash` for CREATE2 verification.*
  Pure indexer convenience; both can be computed off-chain from the
  factory's public state. Skip.

---

### Decision 7 — Vault list storage: on-chain vs indexer-only

**Recommendation:** **On-chain** `address[] public vaults` with a
paginated getter `getVaults(uint256 offset, uint256 limit) returns
(address[] memory)`. Plus `mapping(address => bool) isCanonicalVault`
for cheap "is this a factory-deployed vault?" checks.

**Why on-chain for v1.**
- Theorise's expected scale in year 1: low 1000s of vaults. 1000
  SSTOREs of address-array growth = ~22k gas marginal per
  `createVault`. Acceptable.
- Indexer infra dependency removed: UI can paginate the list directly
  from the contract for v1. Simpler ops.
- `isCanonicalVault` is useful for client safety checks
  ("is this address really a factory vault, or a malicious lookalike?").

**Re-evaluation trigger.** If vault count grows past ~10k, the
`getVaults` getter starts hitting RPC block-gas-limit issues. At that
point, indexer-only is the right answer; the on-chain array becomes
a legacy artifact that the indexer can ignore.

**Alternatives considered:**
- *Indexer-only via events.* Cleaner architecturally; requires
  indexer infra (subgraph or custom) to ship before UI works. Pushes
  the dependency forward. Rejected for v1.
- *Linked-list with `prev` / `next` pointers for removal.* No removal
  use case (vaults are never deleted). Over-engineered. Rejected.

---

### Decision 8 — Factory access control on `createVault`

**Recommendation:** **Permissionless** `createVault` — anyone can
deploy a vault for themselves, paying gas. No allowlist, no fee
beyond gas + the factory's `usdcFloat` consumption.

**Why permissionless.** Theorise's go-to-market is "let any trader
spin up their vault." Gating creation behind admin approval adds
friction without security benefit:
- Username uniqueness already prevents impersonation.
- Reserved-name list already protects protocol identifiers.
- Creator economics are pure self-interest (they put their own USDC
  in); no rent-extraction vector via squatting.
- Admin retains the timelocked levers (fee, builder, caps) regardless
  of who created the vault.

**Operational safeguard.** If a vault is created with abusive content
(e.g., creator address ties to a sanctioned entity), admin can:
- Set `depositTvlCapBps = 100` (1%) to throttle deposits via PR 4
  timelock, OR
- Add the username to a "blocked" list (separate from "reserved")
  via an admin function. **Not in v1 scope; revisit if abuse pattern
  emerges.**

**Alternatives considered:**
- *Allowlist-gated creation (admin pre-approves creators).* Adds
  manual ops burden, slows GTM. Rejected.
- *Per-creation fee (e.g., 5 USDC).* Anti-spam, but Theorise's spam
  surface is low (creators stake real USDC; bots don't show up).
  Rejected for v1; revisit if spam emerges.

---

## Out of scope (deferred)

- **Username transfers between addresses.** Locked at deploy per the
  brief. If a creator wants to migrate their vault to a new EOA, they
  redeem from the old and deploy a new (with a different username, or
  with the same username only after the old vault is paused / removed
  from the registry — which itself isn't supported in v1).
- **Multi-vault per creator.** Each creator gets one vault per
  username. A single creator address could deploy multiple vaults
  with different usernames; the factory allows this naturally
  (`usernameToVault` keyed on username, not creator).
- **Vault pause / decommission.** No "retire this vault" path. If a
  creator stops trading, the vault remains; redemptions remain open.
  Decommission is PR N+1 if ever.
- **Username changes after deploy.** Not supported. Username is
  effectively immutable (stored on vault construction params if
  needed; primary registry is factory's `usernameToVault`).

## Commit plan (after sign-off)

Mirroring PR 4's discipline: scaffolding first, logic next, tests
last, docs after.

1. **Commit 1 — scaffolding.** `Factory.sol` with state vars,
   structs, events, errors. `createVault` stub. ~80 lines.
2. **Commit 2 — username validation + reserved list.** Length,
   character set, reserved check. Pure functions; testable in
   isolation.
3. **Commit 3 — `createVault` logic.** CREATE2 deploy, factory-funded
   pre-activation bridge, creator deposit pull + vault `deposit`,
   registry writes, event emission.
4. **Commit 4 — `topUpFloat` admin op, paginated `getVaults`,
   `isCanonicalVault` getter.** Operational surface.
5. **Commit 5 — tests.** Username validation (happy + revert paths),
   uniqueness collision, reserved-list rejection, CREATE2
   determinism (compute address client-side, compare), end-to-end
   `createVault` happy path, float-insufficient revert, paginated
   getter, vault is callable via factory's known address.
6. **Commit 6 — deploy script for factory.** `DeployFactory.s.sol`
   that takes USDC + CDW + protocolAdmin from env, deploys, prints
   address.
7. **Commit 7 — docs.** `INVESTIGATION_EVM_DEPOSIT.md` §15 (factory
   design), `KNOWN_ISSUES.md` §10 closure, README factory section,
   GAS_ANALYSIS.md update for `createVault` gas budget.

Estimated 2-3 days, comparable to PR 4.

## Decisions surfaced — quick reference

| # | Decision | Recommendation |
|---|---|---|
| 1 | Username scheme + reserved list | Case-insensitive lowercase, 3-32 chars `[a-z0-9_]`, hardcoded ~50 reserved names |
| 2 | Atomic creator deposit at deploy | Factory absorbs 1 USDC activation fee from a protocol-funded float; creator deposit happens in same tx |
| 3 | CREATE2 vs CREATE | CREATE2 with salt = `keccak256(creator, lowercase(username))` |
| 4 | Factory upgradeability | Immutable; v2 deploys alongside if needed |
| 5 | Admin role | Factory's `protocolAdmin` (immutable) becomes every vault's admin |
| 6 | `VaultDeployed` event | `(vault, creator, username, initialStake, sharesMinted, timestamp)` |
| 7 | Vault list | On-chain `address[]` + paginated getter; revisit at 10k+ |
| 8 | `createVault` access | Permissionless |

Awaiting your decision-by-decision response before commit 1.
