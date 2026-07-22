import { useState } from "react";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import type { Address } from "@shared/convert";
import { ADDRESSES, ERC20_ABI, MIDNIGHT_ABI, ORACLE_ABI, type MarketInfo } from "@shared/deployments";
import { formatUnits, parseAmount } from "../lib/format";
import { ZERO_ADDRESS, marketStructOf, maxDebtOf } from "../lib/midnight";
import { runTx } from "../lib/tx";
import { useToast } from "../toast";

export function PositionTab({ market }: { market: MarketInfo }) {
  const { address } = useAccount();
  const config = useConfig();
  const toast = useToast();
  const [repayInput, setRepayInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [collInput, setCollInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = address as Address | undefined;
  const marketStruct = marketStructOf(market);
  const lltv = BigInt(market.market.collateralParams[0].lltv);

  const { data: readsData, refetch } = useReadContracts({
    contracts: (me
      ? [
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "credit", args: [market.id, me] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "debt", args: [market.id, me] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "collateral", args: [market.id, me, 0n] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "isHealthy", args: [marketStruct, market.id, me] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "withdrawable", args: [market.id] },
          { address: market.oracle as Address, abi: ORACLE_ABI, functionName: "price", args: [] },
          { address: market.market.loanToken as Address, abi: ERC20_ABI, functionName: "allowance", args: [me, ADDRESSES.midnight] },
          { address: market.market.collateralParams[0].token as Address, abi: ERC20_ABI, functionName: "allowance", args: [me, ADDRESSES.midnight] },
        ]
      : []) as never,
    query: { enabled: !!me, refetchInterval: 10_000 },
  });
  const reads = readsData as { result?: unknown }[] | undefined;

  if (!me) return <div className="empty">Connect a wallet to view your position.</div>;

  const credit = (reads?.[0]?.result as bigint | undefined) ?? 0n;
  const debt = (reads?.[1]?.result as bigint | undefined) ?? 0n;
  const collateral = (reads?.[2]?.result as bigint | undefined) ?? 0n;
  const healthy = (reads?.[3]?.result as boolean | undefined) ?? true;
  const withdrawable = (reads?.[4]?.result as bigint | undefined) ?? 0n;
  const oraclePrice = (reads?.[5]?.result as bigint | undefined) ?? 0n;
  const loanAllowance = (reads?.[6]?.result as bigint | undefined) ?? 0n;
  const collAllowance = (reads?.[7]?.result as bigint | undefined) ?? 0n;

  const maxDebt = maxDebtOf(collateral, oraclePrice, lltv);
  const utilization = maxDebt > 0n ? Number((debt * 100n) / maxDebt) : debt > 0n ? 100 : 0;
  const maxWithdraw = credit < withdrawable ? credit : withdrawable;

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function approveIfNeeded(token: Address, current: bigint, needed: bigint) {
    if (current >= needed) return;
    await runTx(config, {
      address: token,
      abi: ERC20_ABI as never,
      functionName: "approve",
      args: [ADDRESSES.midnight, 2n ** 256n - 1n],
      account: me!,
    });
  }

  const repayUnits = parseAmount(repayInput, market.loanDecimals) ?? 0n;
  const withdrawUnits = parseAmount(withdrawInput, market.loanDecimals) ?? 0n;
  const collAmount = parseAmount(collInput, market.collateralDecimals) ?? 0n;

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="facts" style={{ borderTop: "none", paddingTop: 0 }}>
        <dl>
          <dt>Credit</dt>
          <dd className="credit">{formatUnits(credit, market.loanDecimals)} {market.loanSymbol}</dd>
          <dt>Debt</dt>
          <dd className="debit">{formatUnits(debt, market.loanDecimals)} {market.loanSymbol}</dd>
          <dt>Collateral</dt>
          <dd>{formatUnits(collateral, market.collateralDecimals, 6)} {market.collateralSymbol}</dd>
          <dt>Max debt</dt>
          <dd>{formatUnits(maxDebt, market.loanDecimals)} {market.loanSymbol}</dd>
          <dt>Healthy</dt>
          <dd className={healthy ? "credit" : "debit"}>{healthy ? "yes" : "NO"}</dd>
          <dt>Market withdrawable</dt>
          <dd>{formatUnits(withdrawable, market.loanDecimals)} {market.loanSymbol}</dd>
        </dl>
        <div className="util mt">
          <div className={utilization > 80 ? "hot" : ""} style={{ width: `${Math.min(100, utilization)}%` }} />
        </div>
        <div className="small-print">debt / max debt: {utilization}%</div>
      </div>

      <div className="section-title">Repay (pulls {market.loanSymbol} 1:1)</div>
      <div className="row">
        <input value={repayInput} onChange={(e) => setRepayInput(e.target.value)} placeholder={formatUnits(debt, market.loanDecimals)} />
        <button className="small" onClick={() => setRepayInput(formatUnits(debt, market.loanDecimals).replace(/,/g, ""))}>
          max
        </button>
        <button
          className="primary"
          disabled={busy !== null || repayUnits === 0n || repayUnits > debt}
          onClick={() =>
            act("repay", async () => {
              await approveIfNeeded(market.market.loanToken as Address, loanAllowance, repayUnits);
              await runTx(config, {
                address: ADDRESSES.midnight as Address,
                abi: MIDNIGHT_ABI as never,
                functionName: "repay",
                args: [marketStruct, repayUnits, me, ZERO_ADDRESS, "0x"],
                account: me!,
              });
              toast(`Repaid ${formatUnits(repayUnits, market.loanDecimals)} ${market.loanSymbol}.`);
            })
          }
        >
          Repay
        </button>
      </div>

      <div className="section-title">Withdraw credit (capped at min(credit, withdrawable))</div>
      <div className="row">
        <input value={withdrawInput} onChange={(e) => setWithdrawInput(e.target.value)} placeholder={formatUnits(maxWithdraw, market.loanDecimals)} />
        <button className="small" onClick={() => setWithdrawInput(formatUnits(maxWithdraw, market.loanDecimals).replace(/,/g, ""))}>
          max
        </button>
        <button
          className="primary"
          disabled={busy !== null || withdrawUnits === 0n || withdrawUnits > maxWithdraw}
          onClick={() =>
            act("withdraw", async () => {
              await runTx(config, {
                address: ADDRESSES.midnight as Address,
                abi: MIDNIGHT_ABI as never,
                functionName: "withdraw",
                args: [marketStruct, withdrawUnits, me, me],
                account: me!,
              });
              toast(`Withdrew ${formatUnits(withdrawUnits, market.loanDecimals)} ${market.loanSymbol}.`);
            })
          }
        >
          Withdraw
        </button>
      </div>

      <div className="section-title">Collateral ({market.collateralSymbol}, index 0)</div>
      <div className="row">
        <input value={collInput} onChange={(e) => setCollInput(e.target.value)} placeholder="0.0" />
        <button
          disabled={busy !== null || collAmount === 0n}
          onClick={() =>
            act("supplyColl", async () => {
              await approveIfNeeded(market.market.collateralParams[0].token as Address, collAllowance, collAmount);
              await runTx(config, {
                address: ADDRESSES.midnight as Address,
                abi: MIDNIGHT_ABI as never,
                functionName: "supplyCollateral",
                args: [marketStruct, 0n, collAmount, me],
                account: me!,
              });
              toast("Collateral supplied.");
            })
          }
        >
          Supply
        </button>
        <button
          disabled={busy !== null || collAmount === 0n || collAmount > collateral}
          onClick={() =>
            act("withdrawColl", async () => {
              await runTx(config, {
                address: ADDRESSES.midnight as Address,
                abi: MIDNIGHT_ABI as never,
                functionName: "withdrawCollateral",
                args: [marketStruct, 0n, collAmount, me, me],
                account: me!,
              });
              toast("Collateral withdrawn.");
            })
          }
        >
          Withdraw
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
