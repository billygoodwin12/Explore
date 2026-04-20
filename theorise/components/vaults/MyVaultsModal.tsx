'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { C, D, M } from '@/styles/tokens';
import { hyperEvm } from '@/lib/wallet/config';
import {
  VAULT_FACTORY_ADDRESS,
  vaultFactoryAbi,
  isFactoryConfigured,
} from '@/lib/contracts/vault-factory';

// The factory was deployed around block 32_922_611 on HyperEVM. Scanning from
// a fixed starting point keeps getLogs bounded; bump this when redeploying.
const FACTORY_DEPLOY_BLOCK = BigInt(32_900_000);

const HYPERSCAN_BASE = 'https://hyperscan.com';

interface VaultRow {
  vault: Address;
  expiryTs: bigint;
  creatorIM: bigint;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

function short(a: string) {
  return `${a.slice(0, 6)}\u2026${a.slice(-4)}`;
}

function formatExpiry(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyVaultsModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: hyperEvm.id });
  const [rows, setRows] = useState<VaultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient || !address || !isFactoryConfigured()) {
      setRows([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const logs = await publicClient.getContractEvents({
          address: VAULT_FACTORY_ADDRESS,
          abi: vaultFactoryAbi,
          eventName: 'VaultCreated',
          args: { creator: address },
          fromBlock: FACTORY_DEPLOY_BLOCK,
          toBlock: 'latest',
        });
        if (cancelled) return;
        const parsed: VaultRow[] = logs.map(l => ({
          vault: (l.args as { vault: Address }).vault,
          expiryTs: (l.args as { expiryTs: bigint }).expiryTs,
          creatorIM: (l.args as { creatorIM: bigint }).creatorIM,
          txHash: l.transactionHash!,
          blockNumber: l.blockNumber!,
        }));
        parsed.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        setRows(parsed);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load vaults.');
        setRows([]);
      }
    })();

    return () => { cancelled = true; };
  }, [publicClient, address]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(27,42,61,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: 16, width: 560, maxWidth: '100%',
          border: `1px solid ${C.borderLight}`, fontFamily: D,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '20px 24px 14px', borderBottom: `1px solid ${C.borderLight}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: D }}>
              My vaults
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: D, marginTop: 2 }}>
              {address ? `${short(address)} \u00b7 HyperEVM` : 'Connect your wallet to view'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `1px solid ${C.borderLight}`, background: C.bg,
              cursor: 'pointer', fontSize: 13, color: C.secondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {'\u2715'}
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {!address && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: C.muted, fontFamily: D }}>
              Connect your wallet to see vaults you&rsquo;ve deployed.
            </div>
          )}
          {address && rows === null && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: C.muted, fontFamily: D }}>
              Loading on-chain events{'\u2026'}
            </div>
          )}
          {address && rows && rows.length === 0 && !error && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: C.muted, fontFamily: D }}>
              No vaults deployed from this address yet.
            </div>
          )}
          {error && (
            <div style={{ padding: 20, fontSize: 11, color: C.redTxt, fontFamily: D }}>
              {error}
            </div>
          )}
          {rows && rows.map(r => (
            <div
              key={r.vault}
              style={{
                padding: '12px 24px', borderBottom: `1px solid ${C.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a
                  href={`${HYPERSCAN_BASE}/address/${r.vault}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    fontSize: 12, fontFamily: M, fontWeight: 700, color: C.accent,
                    textDecoration: 'none',
                  }}
                >
                  {r.vault}
                </a>
                <a
                  href={`${HYPERSCAN_BASE}/tx/${r.txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    fontSize: 10, fontFamily: M, color: C.secondary,
                    padding: '3px 8px', borderRadius: 5,
                    background: C.bg, border: `1px solid ${C.borderLight}`,
                    textDecoration: 'none',
                  }}
                >
                  tx {'\u2197'}
                </a>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.muted, fontFamily: M }}>
                <span>Collateral: <strong style={{ color: C.primary }}>${formatUnits(r.creatorIM, 6)}</strong></span>
                <span>Expires: <strong style={{ color: C.primary }}>{formatExpiry(r.expiryTs)}</strong></span>
                <span>Block: <strong style={{ color: C.primary }}>{r.blockNumber.toString()}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
