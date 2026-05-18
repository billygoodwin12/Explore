# Indexer design notes — Theorise off-chain infrastructure

**Status:** draft for review. Not implemented.
**Working branch:** TBD after sign-off.
**Predecessor:** PR 5 (factory contract) — contract surface frozen.

## 0. Purpose and scope

Two products, one shared substrate.

The **real-time state indexer** maintains a live representation of
every Theorise vault: NAV, total supply, breach state, recent
trades, holder positions, username registry. Low-latency,
append-mostly, optimised for the UI's read path. Drives every screen
in `THEORISE_SPEC.md`.

The **surveillance indexer** pulls HyperLiquid fill data, joins it
against vault on-chain trades, computes counterparty concentration
and cross-vault pair concentration, and exposes per-creator trust
signals. Higher-latency, batch-oriented, optimised for analytics.
Drives the diversity score that gates discoverability + the
internal alerts that flag suspected wash-trading.

These are **logically separate products** with different SLAs,
different storage shapes, different failure modes. They share
infrastructure where it pays (same Postgres instance, same chain-
event reader, same deployment) but the data models and update
cadences differ. This separation matters: a wave of new vault
deployments shouldn't slow down the surveillance batch, and a
surveillance backlog shouldn't block real-time NAV updates.

**Out of scope** (deferred indefinitely or to follow-up specs):
- Cross-platform indexing (we index Theorise vaults only).
- ML-based collusion detection (deterministic concentration metrics
  for v1; ML pattern detection is a follow-on if surveillance data
  shows the deterministic metrics miss obvious cases).
- Public dashboards / leaderboards (that's the UI's job; the
  indexer just exposes the data).
- Real-time alerting beyond basic operational monitoring (Slack
  notification on indexer-down is in scope; alerting users to
  changes in creator scores is a product feature for later).

---

## 1. Architecture overview

### 1.1 Real-time state indexer

**Inputs:**
- HyperEVM events from `Factory.sol` and every deployed
  `CreatorVault.sol`. Listened to via WebSocket or polling RPC.

**Outputs:**
- `vaults` table: per-vault state (address, creator, username,
  current NAV, total supply, breach state, creation block).
- `holders` table: (vault, address, shares).
- `vault_events` table: append-only event log.
- `vault_nav_history` table: NAV samples (per block or per
  state-mutating event, whichever is cheaper).

**SLA:**
- p50 freshness ≤ 5 seconds after a block confirms.
- p99 freshness ≤ 30 seconds.
- Read API p50 latency ≤ 50ms (cache-warm), p99 ≤ 200ms.

**Update path:**
WebSocket event → handler → upsert row → invalidate cache → done.
Synchronous, simple. No external API calls in the hot path.

### 1.2 Surveillance indexer

**Inputs:**
- Vault on-chain trade events (`OrderPlaced` from `CreatorVault`).
- HyperLiquid trade-fill data via REST/WebSocket API for each
  vault's Core spot/perp account address.
- HL S3 archive for backfill of historical fills beyond API
  retention (see §2.3).

**Outputs:**
- `vault_fills` table: per-vault fill records joined with
  counterparty addresses.
- `counterparty_snapshots` table: rolling-30d counterparty
  concentration per vault (recomputed daily at minimum).
- `cross_vault_pairs` table: when two Theorise vaults trade with
  each other, accumulator of pair volume.
- `creator_scores` table: derived metrics (diversity score,
  tenure-adjusted drawdown) per vault.

**SLA:**
- Fill data freshness: ≤ 1 hour after the trade fills on Core.
  Surveillance is not user-facing real-time; an hour of lag is
  acceptable.
- Score recomputation: nightly batch + on-demand recompute when a
  significant new fill lands (>1% of vault NAV).

**Update path:**
Scheduled job (cron / queue worker) → polls HL API per vault →
upserts fill rows → triggers recompute of affected metrics →
done. Asynchronous, retry-tolerant.

### 1.3 How they coexist

Both run as services inside a single deployment (initially). They
share:
- Same Postgres instance (different schemas: `live`, `surveillance`).
- Same event reader for HyperEVM (real-time index writes to its
  schema; surveillance reads on-chain trade events from
  `live.vault_events` as a trigger for fill-pulls).
- Same monitoring + alerting infrastructure.
- Same deployment (single container or single VM).

They don't share:
- Update cadence (real-time vs hourly).
- Failure semantics (real-time outage breaks UI; surveillance
  outage delays score updates but doesn't break UI).
- Scaling axis (real-time scales with deployed-vault count;
  surveillance scales with active-trading volume).

The separation is logical, not physical. Splitting into separate
deployments is a future scale move if either workload demands its
own infrastructure footprint.

---

## 2. Data sources

### 2.1 HyperEVM event stream

**Mechanism.** `viem` WebSocket subscription to HyperEVM RPC.
Subscribe to logs filtered by topic + address (vault addresses
discovered via `VaultDeployed` events from the factory).

**Reorg handling.** HyperEVM finality is fast (block time ~1s,
deterministic finality once block confirms). Confirmation depth =
**1 block** for real-time updates with a follow-up reconciliation
pass at 12 blocks (the conservative "deep finality" mark on most
EVMs). Reorgs at >1 block on HL would be a major chain event we'd
respond to operationally, not silently.

**Backfill.** On indexer start (cold or after extended outage),
walk from `Factory` deployment block forward in 10k-block chunks
using `eth_getLogs`. Process events in chronological order. Idempotent
upserts so re-running is safe.

**Failure mode: RPC disconnect.** Reconnect with exponential backoff;
once reconnected, query for any missed blocks and replay. The event
schema is keyed on `(blockNumber, txIndex, logIndex)` so duplicates
get deduped at write time.

### 2.2 HyperLiquid fill API

**Mechanism.** HL REST API (`https://api.hyperliquid.xyz/info`)
endpoints `userFills`, `userFillsByTime`. Per vault, periodic poll
for new fills since the last cursor. WebSocket subscription via the
`fills` channel is also available — preferred for real-time, with
REST as fallback / backfill.

**Per-vault polling cadence.** Vaults trade at varying frequencies
— a creator running passive long exposure may trade once a day; a
high-frequency strategy may trade thousands of times per hour.
Adaptive polling: start at 5-minute cadence per vault, accelerate to
10-second cadence for any vault that traded in the last hour,
decelerate to 1-hour cadence for vaults dormant >24h. WebSocket
subscription where supported, REST polling as fallback.

**Rate limits.** HL's published rate limit is 1200 requests/minute
per IP for the info endpoints. At 5-minute base cadence per vault,
the indexer handles ~6000 active vaults from a single IP before
needing distribution. Vault count is well below this for year 1.

**Historical depth.** HL API retention for `userFills` is currently
~7 days. Beyond that, historical fills require the S3 archive
(§2.3). The indexer's normal operation only needs API depth (since
it polls continuously and stores everything); the archive is for
cold-start backfill on a vault that's been deployed for >7 days
before we started indexing it.

**Failure modes.**
- API rate-limit hit → exponential backoff, reduce poll cadence
  for low-activity vaults, alert if sustained.
- HL API outage → indexer queues poll requests; resumes when API
  recovers. Surveillance lag grows but doesn't lose data (HL
  retains 7 days regardless of our connectivity).
- Vault Core spot account not yet indexed → wait for next poll
  cycle, no error.

### 2.3 HL S3 archive (historical backfill)

**Mechanism.** HL publishes hourly trade and order book archives to
a public S3 bucket (this work was already touched during the HIP-3
fee analytics — same architecture pattern). Format is gzipped LZ4
chunks of structured fill records.

**Use case.** Only needed for cold-start backfill of a vault
deployed >7 days before the indexer started indexing it. In steady
state, this is rare (we'd be indexing from `VaultDeployed` onwards
via the API). The S3 path is the recovery hatch for "we lost the
indexer for two weeks and the API forgot 7 days of data."

**Reuse from HIP-3 work.** The HIP-3 S3 puller's chunk-iteration,
LZ4 decoding, and per-vault filter logic transfers directly. The
schema differs (HIP-3 was fee-focused; surveillance is fill-focused)
but the puller infrastructure is the same. Estimated reuse: ~70% of
the puller code, ~30% net-new for surveillance-specific filtering.

**Operational cost.** S3 egress is the cost driver. A typical
hourly chunk is ~50MB; backfilling 30 days of fills is ~36GB egress
per recovery event. AWS S3 egress is ~$0.09/GB → ~$3.20 per cold-
start recovery. Negligible.

---

## 3. Event schema

### 3.1 Contract events to index (per vault)

From `CreatorVault.sol`:

| Event | Used for | Frequency |
|---|---|---|
| `Deposited(caller, receiver, assets, fee, shares)` | Holder positions, NAV updates, deposit history | High (per user deposit) |
| `Redeemed(owner, coreReceiver, shares, amount)` | Holder positions, NAV updates, redeem history | Medium |
| `MovedOnCore(amount, bool toPerp)` | Trade activity tab, perp exposure | Medium |
| `OrderPlaced(asset, isBuy, limitPx, sz, tif)` | Trade activity tab, surveillance trigger | High |
| `StakeBreachStarted(currentStake, required, timestamp)` | Breach banner on vault page, alerts | Rare |
| `StakeBreachCured(currentStake, required, timestamp)` | Clear breach banner | Rare |
| `BuilderApproved(builder, maxFeeRate)` | Builder identity history | Rare |
| `DepositFeeUpdated(bps, recipient)` | Fee history for transparency | Rare |
| `StakeCapUpdated(oldCap, newCap)` | Admin parameter history | Rare |
| `DepositTvlCapUpdated(oldBps, newBps)` | Admin parameter history | Rare |
| `PendingBridgeEnqueued(amount, enqueueBlock)` | In-flight tracker visibility for power users | High |
| `PendingBridgeSettled(amountSettled, pendingStartAfter)` | Tracker settlement events | High |
| `PendingBridgeExpired(amountExpired, pendingStartAfter)` | Anomaly signal | Rare (should never fire in normal ops) |
| `StrandedUsdcSwept(amount)` | Operational visibility | Rare |
| Timelock proposals: `*ChangeProposed`, `*ChangeExecuted`, `*ChangeCancelled` (×4) | Governance transparency: pending admin changes per vault | Rare |

### 3.2 Factory events to index

From `Factory.sol`:

| Event | Used for | Frequency |
|---|---|---|
| `VaultDeployed(vault, creator, username, initialStake, sharesMinted, vaultIndex, timestamp)` | Discover tab listing, username registry, vault address discovery | Medium (per creator onboarding) |
| `UsernameClaimed(username, vault)` | Username namespace mirror (redundant with VaultDeployed, easier for namespace indexers) | Medium |
| `FloatFunded(funder, amount, newBalance)` | Operator transparency: float top-ups | Rare |
| `FloatWithdrawalProposed(to, amount, executableAt)` | Pending operator withdrawal visibility | Rare |
| `FloatWithdrawalExecuted(to, amount)` | Operator withdrawal history | Rare |
| `FloatWithdrawalCancelled(to, amount)` | Pending withdrawal cancellation | Rare |

### 3.3 Derived events (computed from primary events + fills)

These aren't on-chain events; they're indexer-internal "derived"
events written when primary inputs change:

| Derived event | Trigger | Latency tolerance |
|---|---|---|
| `nav_snapshot(vault, block, nav, supply)` | Any state-mutating vault event | Real-time |
| `holder_balance_change(vault, address, oldShares, newShares)` | Deposited / Redeemed / Transfer | Real-time |
| `breach_state_transition(vault, oldState, newState)` | StakeBreachStarted / Cured | Real-time |
| `fill_indexed(vault, hlFillId, counterparty, asset, side, px, sz)` | HL API poll returns new fills | ≤1 hour |
| `concentration_recomputed(vault, top3pct, top10pct)` | Significant new fill + nightly batch | ≤24 hours |
| `cross_vault_pair_observed(vaultA, vaultB, volumeIncrement)` | Fill where counterparty is also a Theorise vault | ≤1 hour |
| `diversity_score_updated(vault, oldScore, newScore)` | Nightly batch + on-demand for >1% NAV moves | ≤24 hours |

---

## 4. Storage model

### 4.1 Schema sketch (Postgres)

**Live schema** (`live.*`):

```sql
-- Source-of-truth append log
CREATE TABLE live.vault_events (
    block_number     BIGINT NOT NULL,
    tx_index         INT NOT NULL,
    log_index        INT NOT NULL,
    block_timestamp  TIMESTAMPTZ NOT NULL,
    vault_address    BYTEA NOT NULL,
    event_signature  BYTEA NOT NULL,  -- topic0
    topics           BYTEA[] NOT NULL,
    data             BYTEA NOT NULL,
    decoded          JSONB,             -- typed parse
    PRIMARY KEY (block_number, tx_index, log_index)
);
CREATE INDEX ON live.vault_events (vault_address, block_number);
CREATE INDEX ON live.vault_events USING GIN (decoded);

-- Materialised view of current vault state
CREATE TABLE live.vaults (
    address          BYTEA PRIMARY KEY,
    creator          BYTEA NOT NULL,
    username         TEXT NOT NULL,
    username_lower   TEXT NOT NULL UNIQUE,
    deploy_block     BIGINT NOT NULL,
    deploy_ts        TIMESTAMPTZ NOT NULL,
    initial_stake    NUMERIC(78,0) NOT NULL,
    current_nav      NUMERIC(78,0) NOT NULL,
    total_supply     NUMERIC(78,0) NOT NULL,
    breach_state     TEXT NOT NULL,     -- 'healthy' | 'breached' | 'cured'
    breach_started_at TIMESTAMPTZ,
    last_synced_block BIGINT NOT NULL
);

CREATE TABLE live.holders (
    vault            BYTEA NOT NULL REFERENCES live.vaults(address),
    holder           BYTEA NOT NULL,
    shares           NUMERIC(78,0) NOT NULL,
    last_updated_block BIGINT NOT NULL,
    PRIMARY KEY (vault, holder)
);

CREATE TABLE live.nav_history (
    vault            BYTEA NOT NULL,
    block_number     BIGINT NOT NULL,
    block_timestamp  TIMESTAMPTZ NOT NULL,
    nav              NUMERIC(78,0) NOT NULL,
    supply           NUMERIC(78,0) NOT NULL,
    PRIMARY KEY (vault, block_number)
);

CREATE TABLE live.username_registry (
    username_lower   TEXT PRIMARY KEY,
    vault            BYTEA NOT NULL,
    claimed_at_block BIGINT NOT NULL
);
```

**Surveillance schema** (`surveillance.*`):

```sql
CREATE TABLE surveillance.vault_fills (
    vault            BYTEA NOT NULL,
    fill_id          BIGINT NOT NULL,         -- HL-assigned
    fill_timestamp   TIMESTAMPTZ NOT NULL,
    asset            TEXT NOT NULL,
    side             TEXT NOT NULL,           -- 'buy' | 'sell'
    px               NUMERIC NOT NULL,
    sz               NUMERIC NOT NULL,
    counterparty     BYTEA,                   -- NULL until joined
    counterparty_is_theorise_vault BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (vault, fill_id)
);
CREATE INDEX ON surveillance.vault_fills (vault, fill_timestamp);
CREATE INDEX ON surveillance.vault_fills (counterparty);

CREATE TABLE surveillance.counterparty_snapshots (
    vault            BYTEA NOT NULL,
    snapshot_ts      TIMESTAMPTZ NOT NULL,
    window_days      INT NOT NULL,            -- typically 30
    top1_pct         NUMERIC(5,4) NOT NULL,   -- 0..1
    top3_pct         NUMERIC(5,4) NOT NULL,
    top10_pct        NUMERIC(5,4) NOT NULL,
    distinct_counterparties INT NOT NULL,
    total_volume_usdc NUMERIC NOT NULL,
    PRIMARY KEY (vault, snapshot_ts, window_days)
);

CREATE TABLE surveillance.cross_vault_pairs (
    vault_a          BYTEA NOT NULL,
    vault_b          BYTEA NOT NULL,
    first_observed   TIMESTAMPTZ NOT NULL,
    last_observed    TIMESTAMPTZ NOT NULL,
    paired_volume_usdc NUMERIC NOT NULL,
    fill_count       INT NOT NULL,
    PRIMARY KEY (vault_a, vault_b),
    CHECK (vault_a < vault_b)                 -- canonical ordering
);

CREATE TABLE surveillance.creator_scores (
    vault            BYTEA PRIMARY KEY,
    diversity_score  NUMERIC(5,4) NOT NULL,   -- 0..1
    drawdown_pct     NUMERIC(5,4),
    score_computed_at TIMESTAMPTZ NOT NULL,
    components       JSONB NOT NULL           -- breakdown for explainability
);
```

### 4.2 Retention policy

| Data | Retention | Rationale |
|---|---|---|
| `live.vault_events` | **Forever** | Cheap (~1KB/event, ~$0.10/GB/mo on managed Postgres). Enables replay/audit. ~1M events ≈ 1GB ≈ $0.10/mo. Trivial. |
| `live.vaults` / `live.holders` / `live.username_registry` | **Forever** (current-state mirror) | Required for the UI. Forever-storage is the natural fit. |
| `live.nav_history` | **Forever**, downsampled after 90 days | Recent: per-event resolution. After 90 days: hourly downsampled. After 1 year: daily downsampled. Storage stays bounded; user-facing charts use the downsampled views. |
| `surveillance.vault_fills` | **18 months** | Trade-level fill data is the storage cost driver. 18mo keeps a full year of context for surveillance + 6mo of "recent history" for creator profiles. Older fills are aggregated into `counterparty_snapshots` and `cross_vault_pairs` before deletion. |
| `surveillance.counterparty_snapshots` | **Forever** | Aggregate snapshots are small (~1KB per vault per day). Required for trend analysis on creator score history. |
| `surveillance.cross_vault_pairs` | **Forever** | Same — small aggregate, useful long-term for forensics. |
| `surveillance.creator_scores` | **Forever** with history (snapshot per recompute) | Provides explainability for "why did this creator's score drop." |

**GDPR / "right to be forgotten" stance.** On-chain data is
immutable and public; we don't have the ability or right to delete
it. The indexer is a public-data mirror. A user requesting deletion
of their on-chain interactions has no on-chain recourse, and the
indexer mirrors the chain. We can scrub off-chain enrichment data
(if we ever add it; v1 has none) but on-chain mirror data persists
by design.

### 4.3 Reindex / backfill story

**Cold start** (new deployment, empty DB):
1. Walk `Factory` deployment block → current head via `eth_getLogs`
   in 10k-block chunks. Discover all vault addresses.
2. For each discovered vault, walk its events from `VaultDeployed`
   block → current head.
3. Reconstruct current state (NAV / supply / holders / breach
   state) by replaying events in order.
4. For surveillance: per vault, pull last 7 days of fills from HL
   API (or pull full history from S3 archive if vault is older).
5. Compute initial counterparty snapshots + creator scores.

**Time estimate:** ~30 minutes for 100 vaults, ~3 hours for 1000
vaults (dominated by per-vault HL API pulls for fills).

**Warm restart** (process crashed, DB intact):
1. Read `last_synced_block` from a state table.
2. Walk forward from there via `eth_getLogs`.
3. Resume HL fill polling from each vault's `last_fill_cursor`.

**Targeted reindex** (a specific vault has bad data):
1. Truncate that vault's rows from `live.vaults`, `live.holders`,
   `live.nav_history`, `surveillance.vault_fills`.
2. Replay events from that vault's `VaultDeployed` block.
3. Re-pull fills from HL.

**Full surveillance recompute** (metric formula changes):
1. Don't touch `live.*`.
2. Truncate `surveillance.counterparty_snapshots`,
   `surveillance.creator_scores`.
3. Walk `surveillance.vault_fills` chronologically, recompute snapshots + scores using the new formula.

All paths are idempotent — re-running produces the same result.

---

## 5. Derived metrics

### 5.1 NAV history

**Definition.** `vault_nav(t) = totalAssets()` at block `t`, where
`totalAssets() = coreSpot + perpAccountValue + pendingBridgedUsdc`.

**Source.** Computed from event stream: starting from
`VaultDeployed` (NAV = initial stake), apply each `Deposited` (+net),
`Redeemed` (-amount), and periodically (every N blocks) read
`totalAssets()` via RPC to catch P&L moves that don't emit events
(perp position mark-to-market).

**Polling cadence for P&L resync.** Every 60 blocks (~1 minute) per
vault that's actively trading; every 3600 blocks (~1 hour) for
dormant vaults. RPC `eth_call` to `vault.totalAssets()`.

**Storage.** `live.nav_history` table; one row per (vault, block)
where NAV materially changed (skip if within 0.01% of prior sample).

### 5.2 Counterparty concentration (rolling 30-day)

**Definition.** For a vault `V` over the trailing 30 days, define
`volume_with(C) = Σ fill.sz * fill.px` for fills where the
counterparty was `C`. Then:
- `top1_pct = max_C(volume_with(C)) / total_volume`
- `top3_pct = sum of top-3 counterparties' volume / total_volume`
- `top10_pct = sum of top-10 / total_volume`
- `distinct_counterparties = |{C : volume_with(C) > 0}|`

A vault trading only against one address has `top1_pct = 1.0`;
a healthy vault on a deep market has `top1_pct < 0.05`.

**Recomputation cadence.** Nightly full batch. On-demand recompute
when a fill lands that moves the trailing 30d total volume by >1%.

**Surveillance threshold.** Internal alert if `top1_pct > 0.30`
sustained over 7 days (suggests counterparty dependence —
not necessarily collusion, but worth manual review).

### 5.3 Cross-vault pair concentration

**Definition.** When vault A's counterparty in a fill is itself
another Theorise vault B (lookup via `live.vaults`), record the
pair (A, B) with the volume. Bidirectional accumulation:
`pair_volume(A, B) = volume_of_fills_where_A_traded_against_B`.

**Why this matters.** Two creators colluding to wash-trade against
each other show up as a concentrated pair. Single-vault counterparty
concentration (5.2) might miss this if the "counterparty" is a
different EOA that happens to also be a Theorise vault.

**Storage.** `surveillance.cross_vault_pairs`. Canonical ordering
(`vault_a < vault_b`) to avoid duplicate pair rows.

**Surveillance threshold.** Internal alert if
`paired_volume / min(vault_a_total_volume, vault_b_total_volume) > 0.20`
sustained over 7 days.

### 5.4 Tenure-adjusted drawdown

**Definition.** A vault's max drawdown from peak NAV over a
configurable window, adjusted for vault tenure:
- Drawdown = `(peak_nav - current_nav) / peak_nav` over trailing N days.
- Tenure adjustment: a 30% drawdown after 30 days of operation is
  weighted differently from 30% after 12 months. Formula:
  `adjusted_drawdown = drawdown × (1 + log(months_in_operation))`.

**Why log-weighted.** A young vault hitting a 30% drawdown is
within normal variance for a discretionary trader still calibrating;
a 12-month vault hitting the same is more meaningful signal of
strategy failure.

**Surveillance use.** Component of diversity score; also
user-visible on creator profile page.

### 5.5 Diversity score

**Definition.** Aggregate signal `0..1` per vault, intended to be
the public-facing "is this creator trading on real markets" badge.
Components (initial formula; revisit based on production data):

```
score = 1.0
score -= 0.50 × top1_pct           if top1_pct > 0.30
score -= 0.30 × cross_vault_pct    if cross_vault_pct > 0.20
score -= 0.20 × min(1, drawdown / 0.50)
score = clamp(score, 0, 1)
```

The formula is intentionally simple for v1. ML-based scoring is
deferred (out-of-scope §0). Components are stored in
`creator_scores.components` JSONB so the score is explainable per
vault: "score is 0.4 because top1_pct = 0.42 (counterparty
concentration)."

**Score visibility decision.** See §10 — this is a surfaced decision.

---

## 6. API surface

### 6.1 Read endpoints

REST. JSON. No mutations.

```
GET /vaults
    ?offset=&limit=  (limit ≤ 100)
    &sortBy=         (nav | tvl | created | username)
    &filterBreach=   ('healthy' | 'breached' | 'all')
    →  paginated list of vault summaries for Discover tab

GET /vaults/:address
    →  full vault state: NAV, supply, holders count, breach state,
       creator, username, deploy block, pending admin proposals

GET /vaults/:address/nav
    ?from=&to=&resolution=  (raw | 1m | 1h | 1d)
    →  NAV samples in the requested window at the requested resolution

GET /vaults/:address/trades
    ?from=&to=&limit=
    →  on-chain OrderPlaced + MovedOnCore events
    →  joined with HL fill data when available (≤1h latency)

GET /vaults/:address/counterparty-score
    →  diversity score + component breakdown (see decision: public
       or admin-only — §10)

GET /vaults/:address/holders
    ?offset=&limit=
    →  paginated holder list (address + share balance)

GET /users/:address/positions
    →  list of vaults this address holds shares in, with current value

GET /usernames/:name/available
    →  { available: bool, reason: 'taken' | 'reserved' | 'invalid' | 'ok' }

GET /factory/state
    →  vaultCount, floatBalance, pendingFloatWithdrawal (if any)
```

### 6.2 Authority — contract vs indexer

Some queries have on-chain authoritative sources. Spec is explicit
about which is which:

| Query | Authority | Indexer role |
|---|---|---|
| Username availability | **Contract** (`factory.isUsernameAvailable`) | Convenience cache; UI may show indexer result for instant feedback but MUST re-check contract before submitting `createVault` tx. |
| Vault NAV (definitive) | **Contract** (`vault.totalAssets()`) | Indexer mirrors with ≤5s lag; OK for UI display. UI should fall back to direct RPC call if indexer is stale. |
| Holder share balance | **Contract** (`vault.balanceOf(addr)`) | Indexer mirrors; same caveat. |
| Breach state | **Contract** (`vault.isInBreach()`) | Indexer mirrors. UI's stake-floor warning banner should ideally re-check on-chain for the canonical answer. |
| Counterparty score | **Indexer only** | No on-chain equivalent. Trust narrative: indexer is open-source + reproducible (§8), so users can verify by running their own. |
| Trade history (with fills) | **Indexer only** (on-chain events lack counterparty info) | Same trust narrative. |
| Username display casing | **Contract** (`factory.usernameDisplay`) | Indexer mirrors; minor — purely cosmetic. |

UI default behavior: indexer for low-stakes reads (listings,
charts), contract for high-stakes reads (pre-tx username availability
check, pre-deposit NAV for share-price preview).

### 6.3 Latency / freshness SLAs

| Endpoint | p50 freshness | p99 freshness | p50 latency | p99 latency |
|---|---|---|---|---|
| `/vaults` (listings) | ≤5s | ≤30s | ≤50ms | ≤200ms |
| `/vaults/:address` | ≤5s | ≤30s | ≤50ms | ≤200ms |
| `/vaults/:address/nav` | ≤5s | ≤30s | ≤100ms | ≤500ms |
| `/vaults/:address/trades` | ≤1h | ≤2h | ≤100ms | ≤500ms |
| `/vaults/:address/counterparty-score` | ≤24h | ≤48h | ≤50ms | ≤200ms |
| `/usernames/:name/available` | ≤5s | ≤30s | ≤30ms | ≤100ms |

### 6.4 Authentication + rate limiting

Public reads, no auth required for v1. Standard rate limiting
(e.g. 100 req/min per IP). API keys deferred to follow-up if
abuse patterns emerge.

CORS open for the Theorise frontend domain; permissive (`*`) for
read endpoints to support third-party indexer-reproducibility work
(see §8).

---

## 7. Operational concerns

### 7.1 High availability

**v1 target.** Single deployment, single Postgres instance, single
event-reader. **Not HA.** Acceptable for v1 because:
- Indexer is read-only; outage doesn't affect contracts or funds.
- UI degrades to "data may be stale" banner + falls back to direct
  RPC for high-stakes reads.
- Indexer can recover from cold-start in <3 hours (§4.3).

**v2 trigger.** When TVL across all Theorise vaults exceeds $10M
or when downtime impact extends to >1% of weekly active users,
upgrade to:
- Postgres primary + read replica.
- Active/passive indexer instances with failover.
- Regional redundancy (US + EU).

### 7.2 Monitoring

What wakes you up at 3am:
- Indexer process dead (process exit, no recent heartbeat).
- HyperEVM event-reader lag >5 minutes (real-time SLA blown).
- HL fill API failures sustained >30 minutes.
- DB connection pool exhausted.
- Disk usage >85%.

What you check in the morning:
- Surveillance batch completion (nightly job ran).
- Score recomputation latency for vaults with significant moves.
- Any creator score that dropped >0.1 overnight (manual review trigger).
- S3 puller errors (rare; only used for cold-start recovery).

Stack: Prometheus + Grafana + AlertManager → PagerDuty/Slack.

### 7.3 Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| RPC disconnect | WebSocket reconnect fails | Auto-reconnect with exponential backoff; alert if sustained >5min. |
| RPC behind / reorg | Event with `block_number > head` | Pause event processing, wait for chain to advance, replay. |
| HL API rate limit | HTTP 429 | Exponential backoff per-vault; reduce polling cadence. |
| HL API outage | All polls return 5xx | Queue polls, resume when API recovers. No data loss (HL retains 7d). |
| DB connection dies | Insert/upsert fails | Reconnect; if persistent, alert. Buffer events in memory up to 1k. |
| DB corruption | Integrity check fails | Restore from nightly backup; reindex from `last_synced_block` of backup. |
| Indexer crashes mid-batch | Process exit | Warm restart from `last_synced_block` state table; idempotent re-processing. |
| Score formula bug | Manual review of vault rankings | Update formula, full surveillance recompute (§4.3). |

### 7.4 Cost estimates

Year-1 projections (conservative — 1000 vaults at end of year):

| Component | Monthly cost |
|---|---|
| Managed Postgres (16 GB RAM, 200 GB SSD) | ~$200 |
| Indexer compute (1 VM, 4 CPU, 8 GB RAM) | ~$50 |
| RPC provider (HyperEVM, ~100M reqs/mo) | ~$100-300 |
| HL API access | Free (public) |
| S3 egress (rare cold-start) | <$10 |
| Monitoring stack (Grafana Cloud free tier or self-hosted) | $0-50 |
| **Total** | **~$400-600/mo** |

At 10,000 vaults: scale Postgres + RPC up; expect ~$1500-2500/mo.

---

## 8. Trust model and verifiability

### 8.1 Centralization risks

The indexer is centralised infrastructure we operate. The trust
narrative concern parallels the one we rejected for the relayer:
single party, single point of failure.

Indexer is different from the relayer in one critical way: **it
cannot move funds, cannot break contracts.** Worst-case indexer
failure is "UI shows stale data" or "creator scores are wrong."
Recoverable via the §7.3 paths or by users falling back to direct
RPC calls.

But there's still a softer concern: **if the platform's wash-trade
detection is "Bill says these creators are clean," that's much
weaker than "anyone can run this open-source indexer against
public chain data and verify the same scores."**

### 8.2 Open-source / reproducibility as a design property

**The indexer source code will be open from launch day.**

This is a design property, not an afterthought:
- The score formula in §5.5 is documented + the code is auditable.
- The schema in §4 is public.
- The S3 puller + HL API integration is the same code anyone
  could write against public APIs.
- A third party with the same data sources can run the same
  indexer and produce identical scores.

Implications:
- We cannot favor specific creators in scoring without it being
  detectable by anyone running the indexer.
- The score formula is a public commitment; changing it requires
  versioning + change announcement.
- Bug reports from the community are an asset, not a liability.

**Reproducibility checklist** (must hold for every score
computation):
- Deterministic: given the same event stream + fill data, the same
  score is computed.
- No external state: scores depend only on public chain data + HL
  public API. No off-chain enrichment, no proprietary signals.
- Versioned: score formula changes bump a version; historical
  scores remain pinned to the formula version they were computed
  under.

Production indexer hosts the canonical version; community can fork.

---

## 9. Stack recommendation

**Recommended: Ponder** (https://ponder.sh) — TypeScript framework
that handles event reading, RPC reconnection, reorg handling, and
provides a Postgres integration out of the box. Cuts ~40% of the
boilerplate vs custom Node+viem+Postgres.

**Trade-offs:**
- Ponder is opinionated about schema + event handler structure.
  Acceptable; the opinions are sound.
- Surveillance (HL API + scoring) is custom code regardless of
  framework — Ponder doesn't help here but doesn't hinder either.

**Alternatives considered:**
- **Custom Node + viem + Postgres.** Maximum control. Recommended
  only if Ponder hits a specific limitation we can't work around.
- **Subsquid.** More powerful (multi-chain, GraphQL out of box) but
  steeper learning curve. Overkill for single-chain Theorise scope.
- **The Graph.** Hosted service; usable but introduces a third-party
  dependency we'd rather avoid for v1.

**Stack summary:**
- Language: TypeScript (Node 20+).
- Event reader: Ponder.
- DB: Postgres 16 (managed via Supabase / RDS / Neon).
- HL puller: custom (Node + axios), reusing HIP-3 work.
- API: Fastify (lightweight, fast, TypeScript-native).
- Monitoring: Prometheus + Grafana (self-hosted) or Grafana Cloud.
- Deployment: single VM (Hetzner / DO) or Fly.io app.
- Repo: separate `theorise/indexer` (not co-located with contracts;
  the indexer is a distinct product).

Estimated build: **3-5 days for the real-time half + 3-5 days for
surveillance** = ~2 weeks of focused work. Fits comfortably in the
audit window.

---

## 10. Decisions surfaced for review

Eight decisions for your sign-off, decision-by-decision pattern
matching PR 4 / PR 5.

### Decision 1 — Real-time + surveillance: separate DBs or shared instance?

Recommendation: **shared Postgres instance with separate schemas
(`live.*` and `surveillance.*`).** Cheaper, simpler, easier to join
when needed. If surveillance grows to dominate the instance, promote
it to its own DB in v2.

### Decision 2 — Fill-data retention: 18 months as proposed?

Recommendation: **18 months for `surveillance.vault_fills`.** Older
data aggregates into counterparty snapshots + cross-vault pairs
before deletion. Bounds storage cost; preserves analytical value.
Alternative: forever (great for forensics, bad for cost) or 6
months (loses year-over-year comparison).

### Decision 3 — Counterparty score visibility: public or admin-only?

**Public per-vault score** — visible on every creator profile, the
"diversity score" badge that gates discoverability tiers. Component
breakdown also public (explainability matters more than gaming risk).

Alternative: admin-only per-vault score + only aggregate public.
Rejected because the score's purpose is user-visible information
("can I trust this creator's track record?"); hiding it defeats the
purpose.

### Decision 4 — Reorg confirmation depth?

Recommendation: **1 block for real-time updates + 12-block deep-
finality reconciliation pass.** HyperEVM finality is fast; >1 block
reorgs are major chain events we'd respond to operationally.
Alternative: wait for 12 blocks (high freshness cost, ~12s lag for
every UI update).

### Decision 5 — Open-source the indexer code from day one, or after launch?

**Day one.** Open from launch. Verifiability is a design property,
not a follow-up. Repo: `theorise/indexer`, MIT or Apache 2.0.

Alternative: delay open-sourcing until post-audit / post-launch
stability. Rejected — community verifiability is the trust story.

### Decision 6 — Indexer-as-launch-dependency?

Two paths:
- **(a) Gate mainnet launch on indexer being operational.**
  Audit window doubles as indexer build window; the two land
  together. Indexer ~2 weeks of focused work, audit window ≥3 weeks
  → fits comfortably. No actual launch delay.
- **(b) Ship contracts to mainnet first, indexer after.** Launch
  date earlier on paper; in practice creates a window where
  creators can wash-trade undetected and the surveillance story
  goes "coming soon" instead of "operational from day one."

**Strong recommendation: (a).** Launching a financial product
without the defense mechanism we've documented as essential is
the wrong call. Audit window is the natural indexer build window;
they're parallel, not serial. (a) does not delay launch.

### Decision 7 — HL S3 archive: in scope for v1 or follow-up?

Recommendation: **in scope for v1**, but with low priority.
Reuse the HIP-3 puller infrastructure (~70% transfer). Needed only
for cold-start recovery of vaults deployed >7 days before the
indexer started indexing them. In steady state, never invoked.

Alternative: defer to follow-up. Accept that any vault deployed
during indexer downtime >7 days has incomplete surveillance until
manual S3 backfill. Not worth the operational risk for a few days
of build savings.

### Decision 8 — Score formula: ship initial heuristic and iterate, or wait for production data?

Recommendation: **ship the §5.5 heuristic at launch.** It's
intentionally simple (top1 concentration + cross-vault pair share
+ tenure-adjusted drawdown). Adjust weights based on production
distribution within 30 days of launch.

Alternative: ship without a score at v1; collect data, formula
later. Rejected because the score is part of the discovery UX
(creators with high scores get more visibility); shipping without
it means the discovery tab has no signal beyond TVL/recency.

---

## Quick reference

| # | Decision | Recommendation |
|---|---|---|
| 1 | DB topology | Shared Postgres, separate schemas |
| 2 | Fill retention | 18 months; aggregate snapshots forever |
| 3 | Score visibility | Public per-vault + components |
| 4 | Reorg depth | 1 block real-time + 12-block reconciliation |
| 5 | Open-source timing | Day one |
| 6 | Launch dependency | Yes — gate mainnet on indexer operational |
| 7 | S3 archive | In scope for v1 (low priority, reuse HIP-3) |
| 8 | Score formula | Ship initial heuristic, iterate post-launch |

Awaiting decision-by-decision sign-off before scaffolding repo.
