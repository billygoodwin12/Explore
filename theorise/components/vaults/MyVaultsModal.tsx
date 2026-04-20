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
// HyperEVM's public RPC caps eth_getLogs at 1000 blocks per request, so we
// window the scan. Keep this strictly below that ceiling.
const LOG_CHUNK = BigInt(900);
// Hard cap on how far back we'll walk in a single open, so the public RPC
// isn't hammered. 900 * 60 ≈ 54k blocks ≈ ~15min of HyperEVM at 1-block/s.
// Enough to catch a freshly deployed vault; older ones need Hyperscan.
const MAX_CHUNKS = 60;
// Pause between chunks to stay under the public RPC's rate limit.
const CHUNK_DELAY_MS = 120;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isRateLimit(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : '';
  return /rate limit|exceeds defined limit|429/i.test(msg);
}

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
  const [scanTruncated, setScanTruncated] = useState(false);

  useEffect(() => {
    if (!publicClient || !address || !isFactoryConfigured()) {
      setRows([]);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const latest = await publicClient.getBlockNumber();
        // Walk backwards so the most recent vaults show up first if the list
        // is huge. Each chunk stays under the 1000-block RPC cap.
        const collected: VaultRow[] = [];
        let to = latest;
        let chunks = 0;
        while (to >= FACTORY_DEPLOY_BLOCK && chunks < MAX_CHUNKS) {
          chunks++;
          const from = to > FACTORY_DEPLOY_BLOCK + LOG_CHUNK
            ? to - LOG_CHUNK + BigInt(1)
            : FACTORY_DEPLOY_BLOCK;
          type EventLog = {
            args: { vault: Address; expiryTs: bigint; creatorIM: bigint };
            transactionHash: `0x${string}`;
            blockNumber: bigint;
          };
          let logs: EventLog[] = [];
          // Retry with exponential backoff on rate-limit responses.
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const raw = await publicClient.getContractEvents({
                address: VAULT_FACTORY_ADDRESS,
                abi: vaultFactoryAbi,
                eventName: 'VaultCreated',
                args: { creator: address },
                fromBlock: from,
                toBlock: to,
              });
              logs = raw as unknown as EventLog[];
              break;
            } catch (e) {
              if (!isRateLimit(e) || attempt === 4) throw e;
              await sleep(500 * Math.pow(2, attempt));
              if (cancelled) return;
            }
          }
          if (cancelled) return;
          for (const l of logs) {
            collected.push({
              vault: l.args.vault,
              expiryTs: l.args.expiryTs,
              creatorIM: l.args.creatorIM,
              txHash: l.transactionHash,
              blockNumber: l.blockNumber,
            });
          }
          // Incremental render so the user sees rows as we scan back.
          if (collected.length > 0) {
            setRows([...collected].sort((a, b) => Number(b.blockNumber - a.blockNumber)));
          }
          if (from === FACTORY_DEPLOY_BLOCK) break;
          to = from - BigInt(1);
          await sleep(CHUNK_DELAY_MS);
          if (cancelled) return;
        }
        if (cancelled) return;
        if (chunks >= MAX_CHUNKS && to > FACTORY_DEPLOY_BLOCK) {
          setScanTruncated(true);
        }
        setRows(collected.sort((a, b) => Number(b.blockNumber - a.blockNumber)));
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
          {scanTruncated && rows && rows.length === 0 && !error && (
            <div style={{ padding: 20, fontSize: 11, color: C.muted, fontFamily: D, textAlign: 'center' }}>
              Scanned the most recent blocks only. Older vaults may exist — check MetaMask tx history or Hyperscan.
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
