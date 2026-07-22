import { useState } from "react";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import type { Address } from "@shared/convert";
import { ADDRESSES, ERC20_ABI } from "@shared/deployments";
import { formatUnits, parseAmount } from "../lib/format";
import { runTx } from "../lib/tx";
import { useToast } from "../toast";

const TOKENS = Object.entries(ADDRESSES.tokens) as [string, { address: string; decimals: number; symbol: string }][];

// "Mint demo set" = 100,000 mUSDC, 100,000 mDAI, 10 mWETH, 1 mWBTC (4 txs, stepper UI).
const DEMO_SET: Record<string, bigint> = {
  mUSDC: 100_000n * 10n ** 6n,
  mDAI: 100_000n * 10n ** 18n,
  mWETH: 10n * 10n ** 18n,
  mWBTC: 1n * 10n ** 8n,
};

export function FaucetTab() {
  const { address } = useAccount();
  const config = useConfig();
  const toast = useToast();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [demoStep, setDemoStep] = useState<Record<string, "idle" | "pending" | "done" | "error">>({});
  const [error, setError] = useState<string | null>(null);

  const me = address as Address | undefined;

  const { data: balancesData, refetch } = useReadContracts({
    contracts: (me
      ? TOKENS.map(([, t]) => ({
          address: t.address as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [me],
        }))
      : []) as never,
    query: { enabled: !!me, refetchInterval: 10_000 },
  });
  const balances = balancesData as { result?: unknown }[] | undefined;

  if (!me) return <div className="empty">Connect a wallet to mint test tokens.</div>;

  async function mint(sym: string, tokenAddr: Address, amount: bigint) {
    await runTx(config, {
      address: tokenAddr,
      abi: ERC20_ABI as never,
      functionName: "mint",
      args: [me, amount],
      account: me!,
    });
  }

  async function mintDemoSet() {
    setError(null);
    for (const [sym, t] of TOKENS) {
      setDemoStep((s) => ({ ...s, [sym]: "pending" }));
      try {
        await mint(sym, t.address as Address, DEMO_SET[sym]);
        setDemoStep((s) => ({ ...s, [sym]: "done" }));
      } catch (e) {
        setDemoStep((s) => ({ ...s, [sym]: "error" }));
        setError((e as Error).message);
        return;
      }
    }
    toast("Demo set minted: 100,000 mUSDC · 100,000 mDAI · 10 mWETH · 1 mWBTC");
    refetch();
  }

  const icon = (s?: string) => (s === "done" ? "✓" : s === "pending" ? "…" : s === "error" ? "✗" : "·");

  return (
    <div style={{ maxWidth: 560 }}>
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Balance</th>
            <th>Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {TOKENS.map(([sym, t], i) => {
            const bal = (balances?.[i]?.result as bigint | undefined) ?? 0n;
            return (
              <tr key={sym}>
                <td>{sym}</td>
                <td>{formatUnits(bal, t.decimals)}</td>
                <td>
                  <input
                    value={inputs[sym] ?? ""}
                    onChange={(e) => setInputs((x) => ({ ...x, [sym]: e.target.value }))}
                    placeholder="1000"
                    style={{ width: 120 }}
                  />
                </td>
                <td>
                  <button
                    className="primary small"
                    disabled={busy !== null || !parseAmount(inputs[sym] ?? "", t.decimals)}
                    onClick={async () => {
                      setBusy(sym);
                      setError(null);
                      try {
                        await mint(sym, t.address as Address, parseAmount(inputs[sym]!, t.decimals)!);
                        toast(`Minted ${inputs[sym]} ${sym}.`);
                        refetch();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Mint
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="section-title">Demo set</div>
      {TOKENS.map(([sym]) => (
        <div className="step" key={sym}>
          <span className="status">{icon(demoStep[sym])}</span>
          <span className="grow">
            Mint {formatUnits(DEMO_SET[sym], TOKENS.find(([s]) => s === sym)![1].decimals, 0)} {sym}
          </span>
        </div>
      ))}
      <button className="primary mt" onClick={mintDemoSet} disabled={busy !== null}>
        Mint demo set
      </button>
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
