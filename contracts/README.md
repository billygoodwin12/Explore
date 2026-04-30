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

## Deploy a CreatorVault to testnet

Copy `.env.example` to `.env`, fill in `PRIVATE_KEY`, then:

```sh
export $(grep -v '^#' .env | xargs)
forge script script/DeployCreatorVault.s.sol \
  --rpc-url hyperevm_testnet \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

The deploy script reads `USDC_ADDRESS`, optional `CREATOR_ADDRESS`, `VAULT_NAME`,
and `VAULT_SYMBOL` from the env. Defaults: creator = deployer, name = "Theorise
Test Vault", symbol = "tVAULT".

## Layout

- `src/CreatorVault.sol` — vanilla ERC-4626 vault (v0.1 skeleton, no orders yet)
- `script/DeployCreatorVault.s.sol` — single-vault deploy
- `test/CreatorVault.t.sol` — deposit/withdraw round-trip + share split

See `../DECISIONS.md` for the architectural rationale.
