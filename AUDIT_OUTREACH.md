# Audit firm outreach — Theorise creator vaults

**Status:** ready to send. Send to Spearbit, Cantina, Zellic
(optionally Trail of Bits / Sherlock / Code4rena as a fourth
competitive-bid option) in parallel. Goal is three competing
scopes + timelines + quotes, not a pick.

**Send sequencing decision:** repo is in a pre-merge state with three
stacked PRs (#1 → #2 → #3). Firms can scope against branch state;
they don't need a merged main. **Sending now** parallelises the slowest
external dependency (1-2 week audit queue) with internal work that
remains (self-review, indexer build, UI scaffolding).

## Cover note

> Hi [firm name],
>
> Theorise is a creator-vault platform on Hyperliquid (HyperEVM,
> chain 999). We're at audit readiness on our smart contract layer
> and would like to scope an engagement.
>
> Repo: https://github.com/billygoodwin12/Explore (the `contracts/`
> directory; ~1,500 LOC across `CreatorVault.sol` and `Factory.sol`).
> Currently three stacked PRs in review (#1, #2, #3) — these will
> merge to main in sequence before the engagement starts but the
> branch state is the audit-ready code. **197 tests passing.**
> Empirical bridge behavior verified via four mainnet probes
> documented in `INVESTIGATION_EVM_DEPOSIT.md` §12.1 and §15
> (probe tx hashes + blocks included).
>
> Architecture: ERC-4626 creator vaults with EVM→Core bridging via
> Circle's CoreDepositWallet, contractually-enforced creator stake
> floor (5% of TVL capped at $250K with a 48h cure), an in-flight
> bridge tracker that closes async-bridge sandwich windows
> structurally, time-locked admin operations (24h for fee / TVL /
> builder; 7d for stake cap and float withdrawal; all cancels
> permissionless), and a permissionless factory with username
> uniqueness + atomic creator-stake deposit at deploy time.
>
> **What we're asking from you:**
> - **Earliest engagement start date** (queue depth).
> - **Expected engagement duration** for ~1,500 LOC of Solidity
>   with the test + docs surface noted above.
> - **Scope** — single engagement covering both contracts, or
>   staged (vault first, factory second)? Coverage depth —
>   differential against existing audited ERC-4626 patterns or
>   full bespoke?
> - **Final report suitable for public release** + **1-week
>   remediation review** post-initial-report — is this in your
>   standard engagement structure?
> - **Foundry invariant / fuzz test development** as deliverable,
>   or assertion-only?
> - **Mainnet-fork integration tests** against live CDW /
>   CoreWriter — in scope?
> - **HL-ecosystem experience.** We use HyperLiquid's CoreWriter
>   precompile, Circle's CoreDepositWallet for EVM↔Core bridging,
>   and the spot-balance / margin-summary precompiles. Has your
>   firm engaged HL-ecosystem contracts before? Past engagements
>   you can reference?
> - **Re-audit pricing** for post-launch changes.
> - **Ballpark quote** — Series A funding, audit budget in line
>   with typical engagements for protocols of this scope. Not
>   anchoring; just signalling we're not price-shopping for the
>   cheapest option.
>
> Mainnet launch target: Q3 2026. Happy to walk through
> architecture on a call.
>
> [name]

## Pre-audit work already done — relevant context for scoping

This is not a first draft. Worth noting to firms so they scope
appropriately (verification of a documented + tested implementation,
not initial review):

- **4 mainnet probes empirically verifying bridge behavior** (May
  12–17, 2026). Three confirmed CDW→Core credit end-to-end from a
  contract caller; one confirmed cross-block visibility limitation
  that dictated a vault design choice (`bootstrapDeposit` entry
  point). All probe tx hashes + blocks in
  `INVESTIGATION_EVM_DEPOSIT.md`.
- **197 tests passing.** Coverage includes happy paths, all revert
  paths with specific selector + position-info assertions, boundary
  checks (off-by-one detection on timelock guards, etc.), access
  control across all external functions, CREATE2 determinism,
  in-flight tracker state machine, full propose/execute/cancel
  state machines for 5 timelocked operations across the two
  contracts.
- **Three rounds of internal architectural review** captured in
  `DECISIONS.md`, `INVESTIGATION_EVM_DEPOSIT.md`,
  `FACTORY_DESIGN_NOTES.md`, `PR4_DESIGN_NOTES.md`. Decisions
  surfaced and locked decision-by-decision with explicit rationale
  + alternatives considered + risk classification.
- **`KNOWN_ISSUES.md` with 16 entries.** Every residual issue
  documented with description / rationale / risk / target PR (for
  deferred items). 3 CLOSED, 1 VERIFIED, 12 OPEN — accepted v1 or
  deferred with framing.
- **Gas analysis** in `GAS_ANALYSIS.md` for every state-mutating
  function plus cost decomposition.

## Pitch deck attachment (1-pager)

### Architecture summary

**Two contracts:**
- `CreatorVault.sol` (~950 LOC) — per-creator ERC-4626 vault.
  Deposit pulls USDC on EVM, bridges to vault Core spot via Circle
  CDW, mints shares against pre-bridge NAV. Redeem burns shares
  and `spotSend`s pro-rata Core USDC. Creator-only trading
  actions (`moveOnCore`, `placeOrder`, `setBuilderFee`) gated by
  a stake floor + 48h cure.
- `Factory.sol` (~400 LOC) — deploys vaults via CREATE2 with
  deterministic addresses. Username uniqueness (case-insensitive,
  3–30 chars, ~50 reserved). Atomic creator-stake deposit at
  deploy. Protocol-funded float absorbs Circle's 1 USDC activation
  fee per vault.

### Key design decisions for auditor context

- **No keepers.** All bridging happens inline inside user txs. No
  off-chain operator, no relayer infrastructure.
- **Async-bridge handling.** EVM→Core bridge is fire-and-forget;
  HyperCore credits the synthetic event cross-block. We track
  in-flight bridges via an append-only FIFO so `totalAssets()`
  reflects post-bridge NAV during the settlement window
  (closes the sandwich window structurally).
- **Time-locked admin.** All admin parameter changes go through
  propose/execute with a per-function delay (24h for fee, TVL
  cap, builder fee; 7d for stake cap and float withdrawal). All
  cancels are permissionless (defense against admin-key compromise).
- **Immutable contracts.** No upgradeability on vault or factory.
  V2 = parallel deploy.
- **Self-deploy creators.** `Factory.createVault` is permissionless;
  spam-bounded by `MIN_INITIAL_STAKE_USDC = $1000`.

### Empirical verification done

- 3 mainnet bridge probes (May 12–13, 2026): confirmed CDW credits
  Core spot end-to-end from a contract caller; cross-block
  settlement ≈ 0 blocks (sub-second from polling vantage). Tx
  hashes + blocks in `INVESTIGATION_EVM_DEPOSIT.md` §12.1.
- 1 same-tx visibility probe (May 17): confirmed the precompile
  does NOT see CDW credits within the same transaction
  (`lastIntraReadValue = 0` while `readCoreSpotNow = 1000000`).
  This dictated the `bootstrapDeposit` factory-only entry point
  on the vault. Documented in §15 with tx hashes.

### Test surface

- 197 tests in `contracts/test/`. All passing.
- `CreatorVault.t.sol` — 120 tests across deposit, mint, redeem,
  stake invariant + cure state machine, TVL cap, async-window
  behavior, hardening (reentrancy, SafeCast, fee config),
  PR 3-NEW tracker, PR 4 timelock state machine, PR 5
  bootstrapDeposit.
- `Factory.t.sol` — 77 tests across username validation, reserved
  list, createVault happy + 6 revert paths, CREATE2 determinism,
  pagination boundaries, float timelock state machine, coverage
  sweep.
- `BridgeForkTest.t.sol` — mainnet-fork test of the failing
  direct-transfer pattern (proves the broken path so we can't
  regress to it). Excluded from default runs (requires fork URL).

### Open issues catalogued

`KNOWN_ISSUES.md` documents every residual issue with rationale,
risk classification, and (for deferred items) target PR. 16
entries total: 3 CLOSED, 1 VERIFIED, 12 OPEN — accepted v1 or
deferred with explicit framing.

### Documents to read in order

1. `contracts/README.md` — setup, deployment runbook, factory
   runbook, integration notes for UI / indexer.
2. `INVESTIGATION_EVM_DEPOSIT.md` — full bridge investigation +
   PR 3-NEW/4/5 design narratives. §15 is the same-tx probe.
   §16 is the factory summary.
3. `KNOWN_ISSUES.md` — residual issues + risk assessments.
4. `FACTORY_DESIGN_NOTES.md`, `PR4_DESIGN_NOTES.md` — decision
   trees for the two parametric PRs.
5. `GAS_ANALYSIS.md` — gas budgets for every state-mutating
   function.
6. `DECISIONS.md` — protocol-level architectural decisions.

### Scope questions for the firm

- Single-engagement or staged (vault first, factory second)?
- Coverage depth: differential against existing audited
  ERC-4626 implementations (cheaper) vs full bespoke
  (more comprehensive)?
- Includes Foundry invariant / fuzz test development as
  deliverable, or assertion-only?
- Mainnet-fork integration tests against live CDW / CoreWriter
  in scope?
- Re-audit cost for post-launch changes?
- Timeline: queue length + active engagement window?

## Send checklist (revised)

The original "wait for merges" gating was over-conservative. Firms
can scope against branch state; sending now parallelises the audit
queue (1-2 weeks) with internal review work.

- [x] PRs #1, #2, #3 open and visible on GitHub (the audit firm can
      browse them as the canonical reviewable artifact).
- [ ] Send to **three firms in parallel** (don't pick before quotes
      are in). Suggested: Spearbit, Cantina, Zellic. Add a fourth
      (Sherlock or Code4rena competitive-bid) for price discovery.
- [ ] Reply window: give firms 5-7 business days before following up.
- [ ] Use the response window for self-review of PRs #1-3 and to
      start the indexer build (see "What to do during the response
      window" below).

## What to do during the response window (days 1-7)

The audit-firm queue is the slowest external dependency. Use the
window for work that's internal + parallelizable:

1. **Self-review PRs #1, #2, #3 slowly.** Read each diff with no
   other context. Look specifically for: unchecked blocks, CEI
   ordering on external calls, storage layout consistency if any
   structs evolved mid-development, event emission completeness,
   error message specificity.
2. **Build the off-chain indexer.** This is the hard mainnet
   prerequisite that's been deferred. Counterparty surveillance
   for wash-trade detection — without it, the contracts can't
   defend against creator self-trading (documented limitation).
   Scope: event reader for all vault events, HL trade-fill puller
   via HL API, counterparty concentration metric, NAV history.
   Stack: TypeScript + viem + Postgres + Express/Fastify, or
   Ponder/Subsquid framework.
3. **Start UI scaffolding.** Contract surface is frozen by virtue
   of being in merged-or-near-merged PRs. UI can build against
   the ABIs without waiting for audit.

## What to do days 7-14

4. **Pick audit firm** based on quotes + timeline + HL expertise.
5. **Sign engagement; audit window starts.**
6. **Continue UI + indexer build during audit.**
