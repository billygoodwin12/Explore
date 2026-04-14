import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import type { WalletClient } from 'viem';
import { approveAgent } from './exchange';

/**
 * Hyperliquid agent wallet (a.k.a. API wallet) management.
 *
 * Why this exists: Hyperliquid's L1 actions (orders, cancels, leverage, …)
 * are signed against an EIP-712 "phantom agent" domain whose chainId is
 * 1337 — but MetaMask refuses to sign typed data whose domain.chainId
 * doesn't match the wallet's active chainId. So we generate a local
 * secp256k1 keypair, ask the user to approve it once via MetaMask
 * (using the user-signed domain whose chainId matches their wallet),
 * then sign every subsequent L1 action with the local key — no MetaMask
 * prompts, no chainId validation.
 *
 * Agent wallets cannot withdraw funds — they only have trading rights.
 * Storing the private key in localStorage is acceptable for an MVP.
 */

const STORAGE_PREFIX = 'theorise-hl-agent:';
export const AGENT_NAME = 'theorise';

function keyStorageKey(userAddress: string): string {
  return `${STORAGE_PREFIX}${userAddress.toLowerCase()}`;
}

function approvedStorageKey(userAddress: string): string {
  return `${STORAGE_PREFIX}${userAddress.toLowerCase()}:approved`;
}

function loadAgentAccount(userAddress: string): PrivateKeyAccount | null {
  if (typeof window === 'undefined') return null;
  const pk = localStorage.getItem(keyStorageKey(userAddress));
  if (!pk) return null;
  try {
    return privateKeyToAccount(pk as `0x${string}`);
  } catch {
    return null;
  }
}

function createAgentAccount(userAddress: string): PrivateKeyAccount {
  const pk = generatePrivateKey();
  localStorage.setItem(keyStorageKey(userAddress), pk);
  // New key → must be re-approved
  localStorage.removeItem(approvedStorageKey(userAddress));
  return privateKeyToAccount(pk);
}

export function clearAgentAccount(userAddress: string) {
  localStorage.removeItem(keyStorageKey(userAddress));
  localStorage.removeItem(approvedStorageKey(userAddress));
}

/**
 * Get a usable, approved agent account for the user. If none exists,
 * generate one and prompt the user to approve it via MetaMask. The
 * approval call uses the user-signed Hyperliquid domain whose chainId
 * matches the wallet's active chain — so MetaMask happily signs it.
 */
export async function ensureAgentApproved(
  walletClient: WalletClient,
): Promise<PrivateKeyAccount> {
  const userAddress = walletClient.account!.address;

  const existing = loadAgentAccount(userAddress);
  const isApproved = !!localStorage.getItem(approvedStorageKey(userAddress));

  if (existing && isApproved) return existing;

  const agent = existing ?? createAgentAccount(userAddress);

  console.log('[AgentWallet] Approving agent', agent.address, 'for user', userAddress);
  const result = await approveAgent(walletClient, agent.address, AGENT_NAME);

  if (result.status !== 'ok') {
    const errMsg =
      typeof result.response === 'string'
        ? result.response
        : result.error || JSON.stringify(result);
    throw new Error(`Agent approval failed: ${errMsg}`);
  }

  localStorage.setItem(approvedStorageKey(userAddress), String(Date.now()));
  console.log('[AgentWallet] Agent approved');
  return agent;
}
