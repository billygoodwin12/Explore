'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { C, D, M } from '@/styles/tokens';
import { useVaultCreateStore, totalAlloc } from '@/stores/vault-create-store';
import { useCreateVault } from '@/hooks/useCreateVault';
import StepIndicator from './StepIndicator';
import Step1Strategy from './Step1Strategy';
import Step2Timeframe from './Step2Timeframe';
import Step3Fees from './Step3Fees';
import Step4Deployed from './Step4Deployed';

// Viem bundles the full RPC request into error.message; we just want a short
// human line. Detect the common user-rejection case and fall back to the
// shortMessage / first line otherwise.
function formatDeployError(e: unknown): string {
  if (!(e instanceof Error)) return 'Deploy failed';
  const msg = e.message ?? '';
  if (/user (rejected|denied)/i.test(msg) || (e as { name?: string }).name === 'UserRejectedRequestError') {
    return 'Transaction cancelled. Review and try again.';
  }
  const short = (e as { shortMessage?: string }).shortMessage;
  if (short) return short;
  return msg.split('\n')[0].slice(0, 180);
}

const STEP_SUBTITLES = [
  'Step 1 of 4 \u2014 Build your strategy',
  'Step 2 of 4 \u2014 Timeframe & settlement',
  'Step 3 of 4 \u2014 Fees & review',
  'Vault deployed',
];

export default function VaultWizard({ onClose }: { onClose: () => void }) {
  const { address } = useAccount();
  const s = useVaultCreateStore();
  const { create, creating } = useCreateVault();
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = deploying || creating;

  const allocOk = totalAlloc(s.positions) === 100;
  const hasPositions = s.positions.length > 0;
  const hasName = s.name.trim().length > 0;
  const canAdvanceStep1 = allocOk && hasPositions && hasName;

  const handleNext = () => {
    setError(null);
    s.setStep(Math.min(s.step + 1, 4) as 1 | 2 | 3 | 4);
  };

  const handleBack = () => {
    setError(null);
    if (s.step === 1) { onClose(); return; }
    s.setStep(Math.max(s.step - 1, 1) as 1 | 2 | 3 | 4);
  };

  const handleDeploy = async () => {
    if (!address) { setError('Connect your wallet first.'); return; }
    setDeploying(true);
    setError(null);
    try {
      const { vaultAddress, txHash } = await create({
        positions: s.positions,
        deployIM: s.deployIM,
        timeframe: s.timeframe,
        perfFeePct: s.perfFee,
      });

      // Persist off-chain metadata (name, desc, fees) keyed by vault address.
      // Failure here doesn't roll back the on-chain vault; just surface a warning.
      try {
        await fetch('/api/vaults/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vaultAddress,
            txHash,
            name: s.name,
            desc: s.desc,
            positions: s.positions,
            deployIM: s.deployIM,
            timeframe: s.timeframe,
            settlementMode: s.settlementMode,
            perfFee: s.perfFee,
            exitFee: s.exitFee,
            minDeposit: s.minDeposit,
            creatorAddress: address,
          }),
        });
      } catch {
        // metadata write is best-effort
      }

      s.setVaultAddress(vaultAddress);
      s.setStep(4);
    } catch (e) {
      setError(formatDeployError(e));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(27,42,61,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: 16, width: 560, maxWidth: '100%',
          border: `1px solid ${C.borderLight}`, fontFamily: D,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.primary, fontFamily: D }}>
              Create vault
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: D, marginTop: 3 }}>
              {STEP_SUBTITLES[s.step - 1]}
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

        <StepIndicator current={s.step} />

        {/* Body */}
        <div style={{ padding: '18px 28px 22px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {s.step === 1 && <Step1Strategy />}
          {s.step === 2 && <Step2Timeframe />}
          {s.step === 3 && <Step3Fees />}
          {s.step === 4 && <Step4Deployed />}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 28px 8px' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 11, fontFamily: D,
              background: C.redBg, color: C.redTxt, border: `1px solid ${C.red}`,
            }}>
              {error}
            </div>
          </div>
        )}

        {/* Footer */}
        {s.step < 4 && (
          <div style={{ padding: '0 28px 24px', display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleBack}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 10,
                border: `1px solid ${C.borderLight}`, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: D,
                background: C.bg, color: C.secondary,
              }}
            >
              {s.step === 1 ? 'Cancel' : '\u2190 Back'}
            </button>
            <button
              onClick={s.step === 3 ? handleDeploy : handleNext}
              disabled={(s.step === 1 && !canAdvanceStep1) || busy}
              style={{
                flex: 2, padding: '11px 0', borderRadius: 10, border: 'none',
                cursor: (s.step === 1 && !canAdvanceStep1) || busy ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: D,
                background: s.step === 3 ? C.green : C.primary,
                color: '#fff',
                opacity: (s.step === 1 && !canAdvanceStep1) || busy ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {busy ? 'Deploying...' : s.step === 3 ? 'Deploy vault' : 'Continue \u2192'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
