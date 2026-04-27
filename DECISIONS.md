# Theorise — Architectural Decisions Log

Living record of every architectural choice made on the Theorise platform.
Each entry captures the choice, why it was made, what it costs, and what
would trigger reversing it. Every reviewer should be able to read this
file top-to-bottom and understand both what we built and what we deliberately
left out.

Format conventions
- **INTENTIONAL** = chosen on purpose for v0.1; not a deferral. Some are pre-mainnet gates.
- **DEFERRED** = simplified for v0.1, will be added later. Each lists the cost of waiting and the trigger to revisit.
- Entries are organised by layer (contract / keeper / frontend / infra) so reviewers can read the stack one floor at a time.

---

## v0.1 spike findings — TBD

Spike runs after testnet wallets are funded. Each finding becomes a single
entry below — keep these short, one paragraph per question.

### Builder field on CoreWriter
- Status: TBD
- Result: TBD (does CoreWriter accept a builder ref? does the fee arrive at our builder address?)
- Implication: TBD

### Core→EVM USDC return mechanism
- Status: TBD
- Result: TBD (precompile / system action / implicit via account ownership / not possible)
- Implication: TBD

### Contract HL account initialization
- Status: TBD
- Result: TBD (auto-created on first action, or explicit init required)
- Implication: TBD

### Agent system on contract-owned HL accounts (fallback only)
- Status: TBD
- Result: TBD
- Implication: TBD — only relevant if Path 1 has a blocker

---

## Contract layer

### Path 1 (contract signs via CoreWriter) chosen over Path 2 (agent wallet)
- **Why**: trustless signing, single privileged role (keeper-trigger only, no key with HL trade authority), no off-chain key compromise vector for trade execution.
- **Cost**: extra HyperEVM gas per mirror trade. Tolerable on HyperEVM at ~1s small-block latency for retail copy-trading.
- **Reversible**: yes — Path 2 (agent wallet) becomes a fallback if the spike turns up a blocker on Path 1.
- **Open dependency**: confirmed by spike (a) and (b) before contract write.

### NAV via precompile chosen over keeper-pushed `setNAV()`
- **Why**: trustless. Keeper-pushed NAV becomes an oracle with all the attendant attack surface (stale reads, frontrunning, multi-signer plumbing) — precompile gives the data directly from HL.
- **Cost**: extra gas on every deposit/withdraw (precompile read on each `totalAssets()`).
- **Reversible**: only with a major contract version. Treated as load-bearing.
- **Open dependency**: spike confirms `accountMarginSummary` precompile layout for vault-owned HL accounts.

### Single-vault factory in v0.1 — INTENTIONAL
- **Why**: spike + first creator vault validates the architecture. Multi-vault factory is the easy follow-up.
- **v0.1 cost**: only one creator vault deployed at a time during spike.
- **v1 cost**: ~1 day to add factory + per-creator vault registry.

### Mid-flight withdrawal supported, buffer-only payout — INTENTIONAL for v0.1
- **Why**: buffer + pro-rata position close is two systems; ship buffer-only for v0.1, add forced-close in v1.
- **v0.1 cost**: withdrawal reverts if buffer balance < requested. User waits until next position close refills buffer.
- **v1 cost**: ~3 days for pro-rata close path + slippage accounting.
- **Reversal trigger**: first user complaint about withdrawal blocking.

### Performance fee = 0 in v0.1 — INTENTIONAL
- **Why**: we want clean P&L numbers during testing. Fee plumbing exists in the contract; rate is just zero.
- **v0.1 cost**: none — Theorise earns nothing on perf fees during testnet.
- **mainnet upgrade**: set per-vault `perfFeeBps` at deploy. Default still TBD (range 0-3000 bps).

### Circuit breakers — DEFERRED to v1
- **Why**: out-of-band logic, not on the critical mirror path.
- **v0.1 cost**: vault keeps mirroring through drawdowns; manual pause via owner key only.
- **v1 cost**: ~1-2 days (max-drawdown auto-pause, consecutive-fail auto-pause).
- **Reversal trigger**: first depositor takes >50% loss in a v0.1 vault.

### Multisig + UUPS upgradeability — DEFERRED to mainnet gate
- **Why**: testnet vault is non-upgradeable, single-owner-key. Multisig + 48hr timelock is multi-day plumbing.
- **v0.1 cost**: bug discovered = redeploy from scratch on testnet; no migration cost since no real funds.
- **mainnet upgrade gate**: 2-of-3 multisig + UUPS proxy required before any mainnet vault holds real USDC.

### Non-transferable shares — INTENTIONAL for v0.1
- **Why**: per spec; transfer requires cost-basis transfer logic that's a v2 problem.
- **v0.1 cost**: shares stay with original depositor. No secondary market.
- **v1+ cost**: ~3-4 days for transferable shares + cost basis carry.

---

## Keeper layer

### Single Node process, no leader election — INTENTIONAL for v0.1
- **Why**: redundancy adds Redis-based leader election. Worth it in prod, overkill for testnet validation.
- **v0.1 cost**: keeper outage stops mirroring. Manual restart.
- **v1 cost**: ~1-2 days (Redis lock + multiple executor instances).
- **Reversal trigger**: first production-critical outage.

### env-var key (testnet only) — INTENTIONAL for v0.1
- **Why**: HSM/KMS integration is days of plumbing. Testnet has no real funds at risk.
- **v0.1 cost**: keeper key compromise drops trades on testnet only.
- **mainnet upgrade gate**: HSM-backed signer required before any mainnet deploy. Non-negotiable.

### Tracking quality metric — DEFERRED to v1
- **Why**: out-of-band reporting; not on critical path.
- **v0.1 cost**: depositors can't see lag/skip transparency in UI.
- **v1 cost**: ~1 day (events already emitted, just need aggregation + UI badge).
- **Reversal trigger**: first user asking "why was this trade skipped?".

### NAV publisher — DEFERRED indefinitely
- **Why**: we chose precompile-based NAV (see contract layer). No off-chain NAV oracle to publish.
- **v0.1 cost**: none.
- **Status**: removed from architecture entirely.

---

## Frontend layer

### Network switching env-based, not file-duplicated — INTENTIONAL
- **Why**: matches industry-standard pattern (Uniswap, Aave, etc.); avoids drift between mainnet and testnet codebases.
- **Implementation**: `NEXT_PUBLIC_NETWORK={mainnet|testnet}` env var; single `lib/wallet/networks.ts` source of truth.
- **Mainnet legacy disposable factory** stays accessible by toggling env back to mainnet during the migration window.

### My Positions tab with Claim button (disabled until settled) — INTENTIONAL
- **Why**: matches v0.1 product surface — depositors need one place to see all their positions and claim once a vault settles.

### Comments / social feed / leaderboard — DEFERRED to v1
- **Why**: pure social layer, not on the contract/keeper critical path.
- **v0.1 cost**: vault detail page is data-only.
- **v1 cost**: ~2 weeks for the full social stack.
- **Reversal trigger**: ready for creator onboarding beyond friends-and-family.

### Twitter / X integration — DEFERRED to v1+
- **Why**: OAuth + verification flow is independent product surface.
- **v0.1 cost**: creators can't link X accounts; no auto-share on settle.
- **v1 cost**: ~3-5 days (OAuth + verified-creator badge).
- **Reversal trigger**: ready for the verified-creator tier.

---

## Infra layer

### No KMS/HSM in v0.1 — INTENTIONAL
- **Why**: testnet only, no real funds at risk.
- **mainnet upgrade gate**: HSM-backed signer required.

### Postgres minimal schema (vaults, mirror_events) — INTENTIONAL for v0.1
- **Why**: only what's needed to render vault detail and reconcile mirror events.
- **DEFERRED**: NAV history time-series, depositor leaderboard, social tables, indexer checkpoint.
- **v1 cost**: ~2-3 days to add the full schema.

### Use canonical HyperEVM testnet USDC (not a mock) — INTENTIONAL
- **Why**: `HLConstants.sol` already pins `USDC_EVM_TESTNET = 0x2B3370eE501B4a559b57D449569354196457D8Ab` and the testnet Core-deposit bridge wallet. A real bridged token is more representative of mainnet behavior than a mock.
- **Implementation**: testnet faucet drips USDC into the user's HL account; user bridges to HyperEVM via standard bridge or HL UI; `HYPEREVM_USDC` resolves to the canonical testnet address through `lib/wallet/networks.ts`.
- **Fallback**: if testnet USDC turns out to be unfaucet-able for our test wallet, we'll deploy a 6-decimal mock alongside the factory.
