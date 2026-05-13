# Theorise Contracts

Solidity sources for the Theorise creator-vault platform on HyperEVM.

## Setup

Submodules need to be pulled in after a fresh clone:

```sh
git submodule update --init --recursive
```

## Build & test

```sh
forge build
forge test
```

## Deploy a CreatorVault

The deploy script auto-selects the Circle `CoreDepositWallet` by chainid
(mainnet `0x6B9E…0A24`, testnet `0x0B80…C206`). Override with `CDW_ADDRESS`
in the env if needed.

Copy `.env.example` to `.env`, fill in `PRIVATE_KEY` + `USDC_ADDRESS`, then:

```sh
export $(grep -v '^#' .env | xargs)
forge script script/DeployCreatorVault.s.sol \
  --rpc-url <hyperevm_mainnet|hyperevm_testnet> \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

The deploy script reads `USDC_ADDRESS`, optional `CREATOR_ADDRESS`,
`ADMIN_ADDRESS`, `VAULT_NAME`, and `VAULT_SYMBOL` from the env. Defaults:
creator/admin = deployer, name = "Theorise Test Vault", symbol = "tVAULT".

## Deployment runbook — MANDATORY pre-activation step

After deploying a vault, the admin **MUST** pre-activate its Core spot
account before opening deposits to users. Otherwise the first user's
deposit silently loses 1 USDC to Circle's `newCoreAccountFee` and
dilutes everyone (see `INVESTIGATION_EVM_DEPOSIT.md` §11 for the
empirical evidence + the on-chain guard that enforces this).

Pre-activation flow:

1. Get the deployed vault address from the script output. Call it
   `VAULT_ADDR`.
2. From an admin EOA that holds at least 2 USDC on **HyperCore** (not
   EVM), send 2 USDC to `VAULT_ADDR` via the HyperLiquid UI's spot
   transfer or via `usdSend`. The first 1 USDC is consumed as
   `newCoreAccountFee`; the remaining 1 USDC settles on the vault's
   Core spot account.
3. Verify with `cast`:
   ```sh
   cast call "$VAULT_ADDR" "totalAssets()(uint256)" \
     --rpc-url <hyperevm_mainnet|hyperevm_testnet>
   ```
   Should return `1000000` (= 1 USDC, 6-dec) or higher.
4. Once `totalAssets() > 0`, the vault is ready. Users can now call
   `deposit()` without the `VaultNotActivated()` revert.

If you skip this step, `deposit()` will revert on every user attempt
with `VaultNotActivated()`. No funds are at risk — the guard catches
the issue at the EVM boundary — but UX is broken until pre-activation
is performed.

The pre-activation 1 USDC is a one-time bootstrap cost per vault.
Treat it as a deployment overhead. Subsequent inbound bridges to the
same vault (via the user `deposit()` flow) credit 1:1 with no
additional fee.

## Mainnet bridge verification protocol

Before exposing a freshly-deployed vault to users on mainnet, run
`script/MainnetBridgeProbe.s.sol` from a throwaway EOA to confirm
the CDW bridge credits Core spot end-to-end on the deployment
network. See `INVESTIGATION_EVM_DEPOSIT.md` §11 for the empirical
record of the protocol's last execution and `KNOWN_ISSUES.md` §3 for
why this check is still required even after Phase 3 confirmed the
canonical bridge pattern.

## Layout

- `src/CreatorVault.sol` — ERC-4626 creator vault with inline CDW
  bridge, per-tx TVL cap, and Core-side redeem.
- `src/HLConstants.sol` — HyperLiquid addresses + CoreWriter + CDW
  interface.
- `script/DeployCreatorVault.s.sol` — chainid-aware single-vault deploy.
- `script/MainnetBridgeProbe.s.sol` — bridge-verification probe.
- `script/VerifyBridge.s.sol` — legacy testnet bridge probe.
- `test/CreatorVault.t.sol` — 73-test suite covering deposit/redeem,
  bridge accounting, TVL cap, sandwich window, stake-cure state machine.
- `test/BridgeForkTest.t.sol` — Foundry mainnet fork test of the direct-
  transfer pattern (proves the failing path so we can't regress to it).

See `../DECISIONS.md` for the architectural rationale,
`../INVESTIGATION_EVM_DEPOSIT.md` for the bridge investigation, and
`../KNOWN_ISSUES.md` for residual issues + PR 3-NEW plan.
