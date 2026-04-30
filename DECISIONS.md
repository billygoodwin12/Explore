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

## v0.1 spike findings

Phase 0 (foundations) is read-only investigation; Phase 1 is the contract
write. Each finding below is a one-paragraph record.

### Native USDC vs CoreDepositWallet — RESOLVED (Phase 0)
- **Status**: confirmed via cast + HL docs cross-reference (Apr 2026).
- **Result**: HL `spotMeta` returns `evmContract.address` for canonical
  USDC, but that address is **Circle's CoreDepositWallet bridge proxy**,
  not the ERC-20 token. The actual native USDC ERC-20 (where balances
  live and `balanceOf` / `transfer` work) is a separate Circle deployment.
- **Addresses**:
  - Mainnet USDC ERC-20: `0xb88339CB7199b77E23DB6E890353E22632Ba630f`
  - Mainnet CoreDepositWallet: `0x6b9e773128f453F5C2c60935ee2De2cBC5390a24`
  - Testnet USDC ERC-20: `0x2B3370eE501B4a559b57D449569354196457D8Ab`
  - Testnet CoreDepositWallet: `0x0b80659a4076E9E93c7dbe0F10675A16A3e5C206`
- **Implication**: vault contracts (and any code reading user USDC) call
  the native ERC-20 address. Bridging EVM→Core is `IERC20.approve(bridge, x)
  → bridge.deposit(x)` (NOT `IERC20.transfer` to the bridge — that's a
  silent no-op). `lib/wallet/networks.ts` now exposes both addresses
  per-network with the bridge labeled `coreDepositWallet`.

### Core→EVM USDC return mechanism — TBD (Phase 0 follow-up)
- **Status**: HL UI's "Transfer to EVM" works (verified manually). Whether
  CoreWriter `sendAsset` (action 13) does the same thing from a contract
  call has NOT been verified.
- **Implication blocker**: vault buffer refill on position close depends
  on this. Vault holds USDC on Core (margin) and needs to pull it back to
  EVM to satisfy follower withdrawals. If `sendAsset` doesn't work as
  expected, we need an alternate mechanism (HL's withdrawal queue, or a
  new precompile).
- **Next**: spike a contract that calls `sendAsset` for $1 and observes
  whether EVM USDC balance increases.

### Builder field on CoreWriter — TBD
- **Status**: deferred to Phase 1. Spike will be a single contract call to
  CoreWriter action 12 (`approveBuilderFee`) followed by a paid order.
- **Implication**: builder fee revenue is the entire monetization model
  for Theorise. Has to work or the unit economics fail.

### Contract HL account initialization — TBD
- **Status**: deferred to Phase 1. Will observe whether a fresh contract
  address gets a Core account spun up implicitly on first CoreWriter action.

### Agent system on contract-owned HL accounts (fallback only)
- **Status**: TBD — only revisited if Path 1 (contract-as-signer) hits a
  blocker.

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
- **No UI toggle**: networks are switched per deployment (testnet.theorise.xyz vs app.theorise.xyz), not at runtime. Avoids mid-tx footguns and keeps wallet state coherent. Standard practice across major DeFi UIs.

### Balance display: split EVM / Core / Perps — INTENTIONAL
- **Why**: conflating "your balance" across HL Core and EVM is the #1 user confusion in HL-based apps. Showing all three labeled rows mirrors HL's own UX and prevents "where is my money?" support tickets.
- **Surfaces**: vault deposit/withdraw flows show **EVM** as the primary number (that's what gets deposited). `/trade` shows Core balances (matches direct-trading mental model). Header tooltip shows all three.

### In-app bridge UI — DEFERRED to v0.x (post v0.1)
- **Why**: building a deposit-direction (`bridge.deposit()`) and withdrawal-direction (`CoreWriter.sendAsset`) bridge UI is ~1 day of UX (tx tracking, balance refresh, error states). Not on the critical path for validating the creator-vault thesis. HL.app's bridge already exists and users will be familiar with it.
- **v0.1 cost**: users with funds only on Core must bridge externally before depositing into a vault. Add a "Need to bridge? Open HL Bridge" link at the deposit step.
- **v0.x cost**: ~1 day for a minimal in-app bridge panel (3 labeled balances, two direction buttons, single-tx-status form per direction).
- **Reversal trigger**: meaningful signup drop-off at the deposit step traceable to bridge friction.

### My Positions tab with Claim button (disabled until settled) — INTENTIONAL
- **Why**: matches v0.1 product surface — depositors need one place to see all their positions and claim once a vault settles.

### Comments / social feed / leaderboard — DEFERRED to v1
- **Why**: pure social layer, not on the contract/keeper critical path.
- **v0.1 cost**: vault detail page is data-only.
- **v1 cost**: ~2 weeks for the full social stack.
- **Reversal trigger**: ready for creator onboarding beyond friends-and-family.

### Vault discovery UI = social-media feed (not table) — DIRECTIONAL
- **Why**: vaults are creator-led products; users browse them by personality/track-record, not by sortable columns. The discovery surface should look like a feed (creator avatar, headline performance, recent trade, follow/deposit CTA) — closer to Twitter or TikTok than Bloomberg.
- **v0.1 status**: not built. Vault list during v0.1 is functional/utilitarian (likely a simple list).
- **Trigger to build**: after Phase 1 (contract + deposit flow) is working end-to-end; before any external creator onboarding.

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
- **Why**: `HLConstants.sol` (now archived) pinned `USDC_EVM_TESTNET = 0x2B3370eE501B4a559b57D449569354196457D8Ab` and the testnet CoreDepositWallet. A real bridged token is more representative of mainnet behavior than a mock.
- **Implementation**: testnet faucet drips USDC into the user's HL account; user bridges to HyperEVM via HL UI; `HYPEREVM_USDC` resolves to the canonical testnet ERC-20 through `lib/wallet/networks.ts`. Bridge address surfaces separately as `CORE_DEPOSIT_WALLET` for explicit deposit calls.
- **Fallback**: if testnet USDC turns out to be unfaucet-able for our test wallet, we'll deploy a 6-decimal mock alongside the factory.
