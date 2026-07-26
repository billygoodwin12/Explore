# Midnight RFQ

Proof-of-concept RFQ platform for [Morpho Midnight](https://github.com/morpho-org/midnight)
(fixed-rate, fixed-term lending) on Base Sepolia. Offers are EIP-712-signed off-chain, stored on a
small RFQ server, and settled on-chain through the canonical `EcrecoverRatifier` at take time —
maker capital is never locked.

See **[RUNBOOK.md](./RUNBOOK.md)** for the full operator guide and 10-minute demo script, and
**[PILOT.md](./PILOT.md)** for the two-screen / two-wallet pilot with block-explorer verification.

## Layout

```
contracts/           Foundry project
  lib/midnight/      vendored Midnight @ d7d2d123cf1bc65ba5ab3addb08d51511936d42c
  lib/forge-std/     vendored forge-std v1.9.6
  src/               MockERC20, MockOracle, HashHelper (on-chain digest/tick source of truth)
  script/Deploy.s.sol         full-stack deploy: singleton, ratifier, 4 tokens, 4 oracles, 4 markets
  test/EndToEnd.t.sol         acceptance gate 1: full lifecycle, both directions, sign→take→repay→withdraw
  deployments/base-sepolia.json  written by the deploy script
server/              Express RFQ server (port 8787): schema + deployment + on-chain ingest validation
  test/smoke.test.ts          acceptance gate 2: viem-signed offer validates against the live ratifier
web/                 Vite + React + wagmi/viem credit-desk terminal (port 5173)
shared/              types, EIP-712 typed data, struct<->JSON converters, digest parity gate, codegen
scripts/             seed-demo-offer.ts — book seeding utility for local rehearsals
```

## Quickstart

```bash
# toolchain: Foundry, Node >= 20, pnpm
pnpm install
cd contracts && forge build && forge test   # acceptance gate 1
cd ..

# local full-stack rehearsal (no testnet):
anvil --chain-id 84532 &
cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd .. && pnpm gen
pnpm test:shared && RPC_URL=http://127.0.0.1:8545 pnpm test:server   # acceptance gate 2
RPC_URL=http://127.0.0.1:8545 pnpm dev:server &
VITE_RPC_URL=http://127.0.0.1:8545 pnpm dev:web
```

For the real Base Sepolia deployment, follow RUNBOOK.md one-time setup (funded throwaway
deployer key → `forge script … --rpc-url base_sepolia --broadcast` → `pnpm gen`).

## The two things that make signing safe

1. **Digest parity gate** — before any wallet signature, the locally computed
   `hashTypedData` digest is compared against `HashHelper.digestSingle` via `eth_call`
   (`shared/digest.ts`). A mismatch aborts with "typed-data mismatch — do not sign".
2. **Server-side ratification** — the RFQ server staticcalls
   `EcrecoverRatifier.isRatified` before an offer is ever shown to takers, so every
   resting quote in the book carries a signature the chain has already accepted.

## Notes

- Midnight sources are vendored (not a submodule) at the pinned commit so the repo is
  self-contained; licenses are preserved under `contracts/lib/midnight/`.
- `shared/deployments.ts` and `contracts/deployments/base-sepolia.json` are committed from a
  local anvil rehearsal of the deploy (deterministic addresses); re-running the deploy +
  `pnpm gen` retargets everything.
