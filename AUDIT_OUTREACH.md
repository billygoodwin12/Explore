# Audit firm outreach — Theorise creator vaults

**Status:** draft for sending. Send to Spearbit, Cantina, Zellic
(optionally Trail of Bits) in parallel. Goal is three competing
scopes + timelines + quotes, not a pick. Send after PR 5 lands and
PR 1 / PR 4 / PR 5 are merged in order.

## Cover note (~150 words)

> Hi [firm name],
>
> Theorise is a creator-vault platform on Hyperliquid (HyperEVM,
> chain 999). We're approaching audit readiness on our smart
> contract layer and would like to scope an engagement.
>
> Repo: https://github.com/billygoodwin12/Explore (the contracts
> directory; ~1,500 LOC across `CreatorVault.sol` and
> `Factory.sol`). 197+ tests passing. Empirical bridge behavior
> verified via three mainnet probes plus a same-tx visibility
> probe documented in `INVESTIGATION_EVM_DEPOSIT.md` §15.
>
> Architecture: ERC-4626 creator vaults with EVM→Core bridging via
> Circle's CoreDepositWallet, contractually-enforced creator stake
> floor (5% of TVL capped at $250K with a 48h cure), an in-flight
> bridge tracker to close async-bridge sandwich windows,
> time-locked admin operations (24h for fee/TVL/builder, 7d for
> stake cap and float withdrawal), and a permissionless factory
> with username uniqueness + atomic creator-stake deposit at
> deploy time.
>
> Mainnet launch target: Q3 2026. Looking for engagement scope
> (which files, what coverage), timeline (queue + execution
> window), and ballpark quote. Happy to walk through architecture
> on a call.
>
> [name]

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

## Send checklist

- [ ] Wait until PR #1 (PR 2-NEW + 3-NEW) merges. Otherwise the
      audit firm sees a branch with no clear merge path.
- [ ] Wait until PR #2 (PR 4 + cancel retrofit) merges or is at
      "approved + ready to merge."
- [ ] Wait until PR 5 merges or is at the same state.
- [ ] Three firms in parallel (don't pick before quotes are in).
- [ ] Reply window: give firms 7 business days before following up.
