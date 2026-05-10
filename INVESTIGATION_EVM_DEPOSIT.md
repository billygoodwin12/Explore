# INVESTIGATION_EVM_DEPOSIT.md

**Subject:** Findings from §2 of `THEORISE_EVM_DEPOSIT_MIGRATION.md` — investigation of prior EVM-side deposit + bridge attempts before committing to the migration.

**Author:** Claude Code, via line-by-line review of git history, DECISIONS.md, archived spike contracts, and live testnet evidence collected during the May 8-9 sessions.

**TL;DR:** The migration's premise (direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` credits the contract's Core spot balance) was tried and **failed empirically on testnet**. A second path (Circle's `CoreDepositWallet.depositFor`) was also tried and **silently failed for amounts other than the very first attempt**, where the apparent success was later attributed to a parallel EOA→Core UI transfer, not the contract bridge. After three rounds of attempted fixes, the team pivoted to the current Core-deposit architecture explicitly because no EVM→Core path from a contract was reliably crediting Core balance on testnet.

**Recommendation:** Do not proceed with the EVM-deposit migration on testnet without first re-running the verification script (provided alongside this doc) on a fresh deployment. If the script fails on testnet, the migration is moot until either (a) HL testnet behavior changes, or (b) we can confirm mainnet behavior differs and accept testnet-cannot-be-tested as a constraint. Section 4 of this doc lays out the decision tree.

---

## 1. WHAT WAS PREVIOUSLY TRIED

The EVM-side deposit + EVM→Core bridge from a contract was the **original** Phase 1.5 design. It was attempted three times across April 19 → May 9, 2026, before being abandoned. The relevant artifacts are all still in the repo.

### 1.1 Spike contract (April 19 → April 28)

Commit `b3a1249` ("feat(contracts): spike CoreWriter perp order path on HyperEVM", April 19) introduced `contracts/src/PerpOrderSpike.sol` — a minimal contract with the exact end-to-end flow proposed by the migration doc:

```solidity
function bridgeUsdcToCore(uint256 amount) external onlyOwner {
    require(IERC20(usdc).transfer(coreDepositWallet, amount), "usdc transfer");
    emit UsdcBridged(amount);
}
```

(See `contracts.archive/src/PerpOrderSpike.sol:59-64`.) This was paired with a runbook (`contracts.archive/SPIKE.md`) describing the exact `cast send` commands to validate the path on testnet.

The spike was iterated through several configurations:
- Commit `1d32fe5` ("scaffold testnet probes for CoreWriter Path 1 verification") — initial setup pointing at the legacy CoreDepositWallet (`0x0B80…` testnet).
- Commit `94880b2` ("use canonical 0x2000…0000 system address for USDC bridge") — switched to direct transfer to the per-token system address, with this telling commit message excerpt:

> "Testnet probe of the legacy 0x0B80… wallet showed bridge tx succeeding on-chain but no Core spot credit ever landing. Switching to the system address should fix this."

That commit acknowledges the first concrete failure on testnet: tx succeeded, no credit landed.

- Commit `29d1b69` ("use canonical HL-bound USDC address on testnet") — corrected which USDC address the spike was operating on after `spotMeta` confirmed which contract was the actual ERC-20 token vs the bridge proxy.

### 1.2 v0.1 → Phase 1.5: integrated bridge as `bridgeToCore` (May 4)

The spike was archived (commit `128b63c` "Archive sandbox contracts/ to start clean rebuild") and the integrated `CreatorVault.sol` was built. Commit `50fa5bd` ("feat(vault): Phase 1.5 — CoreWriter wiring") added a creator-only `bridgeToCore(amount, toPerp)` that depositors' EVM USDC could be bridged through. Commit message:

> "bridgeToCore(amount, toPerp): IERC20.approve + Circle CoreDepositWallet.deposit() for moving vault USDC EVM → Core. Verified call signature via HL docs: deposit(uint256, uint32) where the dex is 0 (perp) or type(uint32).max (spot). Creator-only."

This used Circle's `CoreDepositWallet.deposit()`, not direct transfer. The vault accepted standard ERC-4626 EVM USDC deposits; creator manually bridged accumulated funds.

### 1.3 First fix attempt: switch to `depositFor` (May 8)

Live testnet testing of `bridgeToCore(5_000_000)` produced the symptom: tx succeeded on EVM, vault Core spot balance did not increase after 60s+ wait. Investigation (research agent, May 8 session) discovered:

- Direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` from a contract **reverts** with Circle USDC's `Blacklistable: account is blacklisted` modifier — Circle blocks this destination as a recipient when transferred from a contract.
- The canonical pattern used by production HyperEVM protocols (per `hyper-evm-lib`) is `CoreDepositWallet.depositFor(recipient, amount, destinationDex)`.

Commit `494ed9d` ("fix(vault): bridgeToCore via Circle CoreDepositWallet, not direct system-address transfer") switched the implementation to `BRIDGE.depositFor(address(this), amount, DEX_SPOT)`. This is the same pattern the migration doc proposes minus the `depositFor` part — but the migration doc proposes plain `transfer` to `USDC_SYSTEM_ADDRESS`, which is the reverted-on-testnet path we already established doesn't work.

### 1.4 Second fix attempt: empirical testing of `depositFor` (May 9)

The May 9 session ran the corrected `depositFor` path on testnet:

| Attempt | Amount | EVM tx | Vault Core spot before | Vault Core spot after | Result |
|---------|--------|--------|------------------------|------------------------|--------|
| 1 | 5 USDC | OK logs show vault → CoreDepositWallet → system address | 5 USDC | 5 USDC | "appears to work" — later attributed to EOA UI activation send, not the contract bridge |
| 2 | 2 USDC | OK logs identical to #1 | 5 USDC | 5 USDC | Silent failure — no credit |
| 3 | 6 USDC | OK logs identical | 5 USDC | 5 USDC | Silent failure — no credit |

The "5 USDC visible after attempt 1" was later identified as the user's separate **EOA Core → vault Core** transfer (sent via HL UI to activate the vault's Core account, ~30 seconds before the contract bridge tx). The contract bridge itself never credited any of the three attempts. We have no positive empirical confirmation that the contract bridge worked even once on testnet.

This is when the architecture pivot happened (commit `b22d545`, May 9). Commit message excerpt:

> "Drops the EVM USDC + bridge approach entirely. After repeated bridge failures (Circle CoreDepositWallet only credited the first 5 USDC; 2 and 6 USDC bridges silently failed), and the realization that HL native vaults already use Core-side deposits as the canonical UX, restructure as: …"

The "first 5 USDC" claim in this commit message was incorrect — see paragraph above. Even the "first credit" was actually the parallel EOA send. Net evidence: zero out of three contract-initiated bridge attempts credited Core.

### 1.5 Reverse direction also tested + fixed in same period

Commit `592005e` ("fix(vault): bridgeToEvm payload — system-address destination + 8-dec amount", May 8) fixed three encoding bugs in the `Core → EVM` direction (`bridgeToEvm`, using CoreWriter action 6 `spotSend`). This direction did get testnet validation later in the May 9 session — the redemption flow successfully spotSent USDC from vault Core back to the user's EOA Core (`0xF256…c040` saw the inbound). So Core → EVM via action 6 works. EVM → Core does not (per all testnet evidence).

---

## 2. WHAT BROKE / WHY IT WAS ABANDONED

Three distinct failure modes were observed:

### 2.1 Direct ERC-20 transfer to `USDC_SYSTEM_ADDRESS` reverts

When called from a contract:

```
Error: Failed to estimate gas: server returned an error response: error code 3:
execution reverted: revert: Blacklistable: account is blacklisted,
data: "0x08c379a0…426c61636b6c69737461626c653a206163636f756e7420697320626c61636b6c6973746564…"
```

The Circle USDC contract's `Blacklistable` modifier blocks transfers where the recipient or sender is blacklisted. On testnet, the system address `0x2000000000000000000000000000000000000000` is blacklisted as a recipient when transfers come from contracts. (EOA-initiated transfers may behave differently; we did not test that, since the migration doc's design path is contract-initiated.)

This is **the exact path the migration doc proposes**. Per the doc's §3.3:

> ```solidity
> SafeERC20.safeTransfer(IERC20(asset()), HLConstants.USDC_SYSTEM_ADDRESS, net);
> ```

Per our May 9 testnet evidence: this reverts.

### 2.2 Circle's `CoreDepositWallet.deposit/depositFor` silently fails

When called from a contract:

- EVM tx succeeds (`status: 1`).
- Tx logs show the full transfer chain: vault → CoreDepositWallet (`transferFrom`), CoreDepositWallet → `0x2000…0000` system address, `BridgedToCore` event.
- **Core spot balance never increases.** Polled at 30s, 60s, 4 minutes — no credit.

Three separate amounts (5, 2, 6 USDC) all behaved identically. The first appeared to credit but was attributed to a parallel EOA UI transfer, not the contract.

Possible explanations not ruled out:
- HL testnet's bridge proxy behavior is buggy / under-maintained for this path.
- There's a per-account or per-amount minimum that we never crossed.
- The activation fee mechanism interacts poorly with contract callers (HL's docs state 1 USDC activation fee on first inbound, but the post-activation behavior also failed).
- Some testnet-specific Circle blacklist / whitelist applies to contracts beyond what's been documented.

We have no diagnostic visibility into Core's settlement layer to determine which.

### 2.3 No prior `CoreWriter` action that bypasses both paths was found

There is no third documented path from EVM to Core from a contract. CoreWriter's `sendAsset` (action 13) and `spotSend` (action 6) operate **from** Core, not to it. The ONLY documented EVM → Core paths are:

1. ERC-20 transfer to per-token system address (testnet: blacklisted from contracts).
2. Circle's CoreDepositWallet proxy (testnet: silent-fail from contracts per our testing).

Both fail on testnet. Mainnet likely behaves differently — Circle's CoreDepositWallet processes $1.27B+ live USDC on mainnet per a research agent's May 8 finding. But mainnet testing requires real funds.

---

## 3. WHAT I CANNOT DETERMINE FROM THE REPO

These are the open questions Bill needs to resolve before proceeding:

### 3.1 Is the testnet failure a testnet-specific quirk that does NOT apply on mainnet?

DECISIONS.md notes (entry "Native USDC vs CoreDepositWallet"):

> "vault contracts (and any code reading user USDC) call the native ERC-20 address. Bridging EVM→Core is `IERC20.approve(bridge, x) → bridge.deposit(x)` (NOT `IERC20.transfer` to the bridge — that's a silent no-op)."

This was Phase 0 research, written before any contract testing. It says transferring directly to the bridge address is a no-op. But the migration doc proposes transferring to `USDC_SYSTEM_ADDRESS` which is a different address (`0x2000…0000` vs `0x0b80…` testnet bridge) — and we have empirical evidence that direct transfer to `0x2000…0000` reverts on testnet rather than no-op'ing.

It's plausible mainnet either (a) doesn't have the Circle blacklist, or (b) credits the system address transfer correctly. We don't know. The only way to find out is run the verification script on mainnet with real money.

### 3.2 Has HL testnet behavior changed since May 9?

We tested on May 9. It's now May 10 (or later, depending when this is read). HL is a fast-moving testnet. It's possible the Blacklistable issue or the silent-fail-from-contracts has been patched on Circle's testnet USDC since.

The verification script in §5 of this doc will surface this if Bill wants to retest.

### 3.3 Was the spike's original test on `0x0B80…` a different failure mode than what we observed on May 9?

Commit `94880b2` (April 28) noted "bridge tx succeeding on-chain but no Core spot credit ever landing" using the legacy CoreDepositWallet address (`0x0B80…` testnet). On May 9 we observed the same symptom against the same address using `depositFor`. So the failure may be one and the same — just rediscovered after the architecture switched.

I don't have explicit visibility into whether `94880b2`'s spike test was using `transfer` (which would now revert) or `deposit/depositFor` (which would silent-fail). The commit message says "bridge tx succeeding" suggests it didn't revert — pointing at silent-fail. But the spike contract's `bridgeUsdcToCore` (in `contracts.archive/src/PerpOrderSpike.sol:62`) uses plain `transfer`, which **should** revert on testnet today. There may have been a testnet behavior change between April 28 (transfer no-op'd) and May 9 (transfer reverts). I can't reconstruct that timeline from the repo alone.

### 3.4 Why did the migration doc's author not know about the prior failures?

If the doc was written without conversation history of the May 9 sessions, that explains it. If it was written with that history, then either:
- The doc's author believes the failures were testnet-specific and mainnet would work.
- The doc's author wants us to retest because they suspect we never properly isolated the contract-bridge from the EOA-bridge confound.

Bill should confirm which. If it's the former, run the verification script on mainnet. If the latter, run it on testnet first.

### 3.5 Was the `depositCoreWallet` minimum ever ruled out?

The May 9 session attempted 5, 2, and 6 USDC. The "5 succeeded" was disambiguated as actually the EOA send. So we have no positive bridge-via-contract observations. It's possible there is a minimum amount (say, 5 USDC) below which the bridge doesn't credit, but the test that would have hit "5 from contract specifically" wasn't isolated cleanly. Re-running with 100 USDC from a fresh contract on a fresh address would help disambiguate.

---

## 4. DECISION TREE

The question is binary: does the EVM → Core bridge work from a contract?

**Path A: Verification script passes on testnet.**
Evidence reverses prior findings. Either (a) HL has fixed the testnet behavior, or (b) our prior tests had a confound we never identified. Proceed with the migration as specified in the doc. Run all PRs 2-NEW through 7-NEW.

**Path B: Verification script fails on testnet, passes on mainnet probe ($5-10).**
Testnet quirk confirmed. Mainnet works. Migration proceeds, but we accept "no contract testing on testnet for the deposit flow" as a permanent constraint. UI mocks the bridge step on testnet; real validation only on mainnet.

**Path C: Verification script fails on both testnet and mainnet probe.**
Migration is moot. Stay with the relayer architecture from the original audit. Accept the operational complexity (server, key, nonce store) as the price of bypassing the broken bridge path.

**Path D: Bill doesn't want to spend mainnet money.**
Migration is moot until either an HL testnet update unblocks the bridge or someone else does the mainnet probe. Stay with the relayer architecture.

The cheapest test is Path A (free). The next cheapest is Path B (~$10 + gas, but real money). Path C/D are decisions about whether to accept relayer complexity.

---

## 5. VERIFICATION SCRIPT

Provided as `contracts/script/VerifyBridge.s.sol`. Two run modes:

- **Default `run()`**: deploys a `BridgeProbe` contract, sends 5 USDC from EOA to the probe, has the probe attempt to bridge to its own Core spot via direct transfer to `USDC_SYSTEM_ADDRESS`. Bill polls the spot balance off-chain via the cast/curl commands the script prints.
- **`runWithAmount(uint256)`**: same but with a user-specified amount. Useful for ruling out a per-amount minimum (test with 100 USDC if 5 USDC fails).

The script distinguishes the failure modes:
- If the bridge tx **reverts** — catch logs the reason. If "Blacklistable: account is blacklisted", we're confirmed in the same testnet failure as May 9.
- If the bridge tx **succeeds** — script prints follow-up commands for Bill to poll Core spot balance over time. If credit lands within 60 seconds: Path A confirmed. If credit never lands within 5 minutes: Path C silent-fail confirmed.

Run it as:

```bash
cd contracts
export $(grep -v '^#' .env | xargs)

forge script script/VerifyBridge.s.sol \
  --sig "run()" \
  --rpc-url $HYPEREVM_TESTNET_RPC \
  --private-key $PRIVATE_KEY --broadcast --legacy

# Then follow the on-screen instructions to poll Core spot balance.
```

Capture the full output. Paste it inline at §6 of this doc when complete.

---

## 6. EMPIRICAL OBSERVATIONS FROM RE-RUN

(To be filled in by Bill after running the verification script. Template:)

```
Date / time:
Network: testnet / mainnet
Probe contract address:
USDC amount probed:

Result code:
Tx hash (bridge attempt):
EVM USDC balance before:
EVM USDC balance after:
Core spot balance before:
Core spot balance after (t=10s):
Core spot balance after (t=60s):
Core spot balance after (t=300s):

Conclusion: [Path A / B / C reached]
```

---

## 7. FILES REFERENCED

- `contracts/src/CreatorVault.sol` — current Phase 1.5 (Core-deposit) production.
- `contracts.archive/src/PerpOrderSpike.sol` — original April 19 spike contract; lines 58-64 are the EVM → Core bridge attempt via direct `transfer`.
- `contracts.archive/SPIKE.md` — original testnet runbook for the spike.
- `DECISIONS.md` — Phase 0 architectural decisions.
- Git commits: `b3a1249`, `1d32fe5`, `94880b2`, `29d1b69`, `50fa5bd`, `494ed9d`, `592005e`, `b22d545`.

---

## 8. RECOMMENDATION

**Do not delete the relayer fallback work mentally yet.** Keep the prior audit's PR 2 (EIP-712 + relayer) as a viable architecture until the verification script confirms one of:
- Testnet bridge works (Path A) → migration is the better choice, drop relayer permanently.
- Mainnet probe succeeds (Path B) → migration is the better choice for mainnet, relayer is overkill.
- Both fail (Path C) → relayer is the only viable architecture; resume PR 2 of the prior audit.

**Specifically: do not start any PR 2-NEW through 7-NEW work in this branch until Bill has run the verification script and posted results in §6.**

PR 1 (stake-floor changes) is already merged and is independent of the deposit architecture; it stands regardless of which path we take.
