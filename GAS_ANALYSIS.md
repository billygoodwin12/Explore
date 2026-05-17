# Gas analysis — post PR 3-NEW + PR 4

Measured via `forge test --gas-report` on the 111-test suite (PR 4
tip). All numbers in gas units; convert to USD at the prevailing
HyperEVM gas price.

## User-facing functions (medians)

| Function | Min | Median | Max | Notes |
|---|---|---|---|---|
| `deposit` | 40,771 | **247,426** | 274,347 | Path through `_settlePending` + bridge + `_enqueuePending` + `_mint` + `_updateStakeBreachState`. The median dominates because most tests exercise the live deposit path. |
| `mint` | 192,603 | **241,974** | 241,986 | Routes through `_doDeposit`, same overhead as `deposit`. |
| `redeemCore` | 50,457 | **65,707** | 85,369 | `_settlePending` + share-math cascade + spotSend action emit. |
| `moveOnCore` | 21,897 | **63,195** | 72,024 | CoreWriter action + `inFlightFromPerp` update (perp→spot branch). |
| `placeOrder` | 22,805 | **74,432** | 74,432 | CoreWriter action + breach-cure check. |
| `sweepStrandedEvmUsdc` | 62,007 | **164,173** | 164,173 | Bridge + `_enqueuePending` for stranded amount. |

## Admin operations (per call)

PR 4 splits each admin op into propose + execute (two transactions).
For audit narrative: admin operational gas roughly doubles vs the
PR 3-NEW immediate-setter ABI.

| Operation | Propose median | Execute median | Cancel median |
|---|---|---|---|
| Fee change | 48,352 | 31,855 | 25,363 |
| Stake cap | 47,825 | 30,446 | 23,500 |
| TVL cap | 47,662 | 31,499 | 23,566 |
| Builder fee | 70,359 | 66,476 | 23,545 |

Builder-fee propose/execute is heavier because execute fires a
CoreWriter action (`approveBuilderFee`); the other three only update
storage.

Cancel cost is dominated by the `delete` SSTORE (~5k refund-adjusted
in practice) plus event emission overhead.

## Tracker overhead breakdown (PR 3-NEW)

`_settlePending` is called at entry of every state-mutating function.
Cost components per call (head-pointer FIFO, observation-based drain):

- 1 SLOAD for `lastCheckedCoreSpot`
- 1 SLOAD for `inFlightFromPerp`
- 1 precompile read for current Core spot (HyperLiquid precompile is
  cheap; treat as ~2,300 gas median)
- Iteration over pending entries: 1 SLOAD per entry + 1 SSTORE when
  draining
- 1 SSTORE for `lastCheckedCoreSpot` checkpoint
- 1 SSTORE for `pendingBridgedUsdc` accumulator if it changed

Empirical: deposit median jumped from ~210k pre-PR-3-NEW to ~247k
post — overhead of roughly 35k gas per deposit, dominated by the
checkpoint SSTORE + one SLOAD for the precompile read.

The head-pointer FIFO keeps iteration bounded — `_settlePending`
processes at most `pending.length - pendingStart` entries per call,
which in steady-state is ≤1 (entries settle as fast as they're added
on probe 3's observed settlement of 0 blocks).

## Reentrancy guard cost

PR 3-NEW commit 1 (`edd7dde`) added `nonReentrant` to seven
state-mutating functions. Each adds:

- 1 SSTORE on entry (set status = ENTERED)
- 1 SSTORE on exit (set status = NOT_ENTERED, refund-adjusted)
- 1 SLOAD on entry (read status)

Cost contribution per gated call: ~2,300 gas (OpenZeppelin
implementation, refund-aware). Already included in the medians above.

## Economic implications

**HyperEVM gas pricing assumptions (May 2026):** baseline gas price
~0.0001 gwei (extremely cheap). Even worst-case deposit at 274k gas
costs ~$0.001 in HYPE. The deposit's economic floor remains
`MIN_DEPOSIT_USDC = $10`, not gas-limited.

**If gas prices rise 100×** (still well below Ethereum L1): deposit
at 274k gas → ~$0.10 — still negligible relative to the $10 floor.

**Reasoning for not lowering `MIN_DEPOSIT_USDC`:** the $10 floor was
chosen for share-precision reasons (avoid dust shares under the
6-decimal vault decimals offset), not gas reasons. The tracker
overhead doesn't bind it.

## Comparison vs PR 2-NEW baseline

PR 2-NEW deposit median (pre-tracker, pre-hardening) was ~210k gas.
The +35k overhead in PR 3-NEW + PR 4 buys:

- Sandwich-window closure (structural, not just bounded by cap)
- Transient false-positive breach state closure
- Reentrancy guards on every state-mutating function
- SafeCast on all downcasts
- Structured redeem errors

For a one-shot deposit per user, 35k gas is a rounding error on
HyperEVM. Worth it.

## When to re-run

Re-run `forge test --gas-report` if any of the following land:
- New state variable added to the hot path
- `_settlePending` algorithm change (e.g., adding `inFlightFromRedeem`
  per KNOWN_ISSUES §9)
- Factory contract added (PR 8) — adds a new path for vault creation
  that needs its own measurement
