import { useEffect, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { MIDNIGHT_ABI, ORACLE_ABI, ADDRESSES, type MarketInfo } from "@shared/deployments";
import { countdown, formatUnits, formatWad, truncAddr } from "../lib/format";
import { EXPLORER } from "../wagmi";

const COLLATERALS = ["mWETH", "mWBTC"];
const LOANS = ["mUSDC", "mDAI"];

export function MarketRail(props: {
  collateralSym: string;
  loanSym: string;
  setCollateralSym: (s: string) => void;
  setLoanSym: (s: string) => void;
  market?: MarketInfo;
}) {
  const { market } = props;
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const marketId = market?.id as `0x${string}` | undefined;

  const { data: oraclePrice } = useReadContract({
    address: market?.oracle as `0x${string}`,
    abi: ORACLE_ABI,
    functionName: "price",
    query: { enabled: !!market, refetchInterval: 10_000 },
  });

  const { data } = useReadContracts({
    contracts: (marketId
      ? [
          { address: ADDRESSES.midnight as `0x${string}`, abi: MIDNIGHT_ABI, functionName: "withdrawable", args: [marketId] },
          { address: ADDRESSES.midnight as `0x${string}`, abi: MIDNIGHT_ABI, functionName: "marketState", args: [marketId] },
        ]
      : []) as never,
    query: { enabled: !!marketId, refetchInterval: 10_000 },
  });
  const stateReads = data as { result?: unknown }[] | undefined;

  const maturity = market ? Number(market.market.maturity) : 0;
  const now = Math.floor(Date.now() / 1000);
  const termTotal = 30 * 24 * 3600;
  const elapsedPct = Math.min(100, Math.max(0, ((termTotal - (maturity - now)) / termTotal) * 100));

  // Oracle price rendered as human price: divide by 10^(36 + loanDec - collDec).
  const humanOracle =
    market && oraclePrice !== undefined
      ? formatUnits(oraclePrice as bigint, 36 + market.loanDecimals - market.collateralDecimals, 2)
      : "—";

  const withdrawable = stateReads?.[0]?.result as bigint | undefined;
  // marketState tuple: [totalUnits, lossFactor, withdrawable, continuousFeeCredit, cbp0..6, continuousFee, tickSpacing]
  const marketState = stateReads?.[1]?.result as readonly unknown[] | undefined;
  const totalUnits = marketState?.[0] as bigint | undefined;
  const tickSpacing = marketState?.[12] as number | undefined;

  return (
    <aside className="rail">
      <label className="field">
        <span>Collateral</span>
        <select value={props.collateralSym} onChange={(e) => props.setCollateralSym(e.target.value)}>
          {COLLATERALS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Loan asset</span>
        <select value={props.loanSym} onChange={(e) => props.setLoanSym(e.target.value)}>
          {LOANS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>

      {market && (
        <div className="facts">
          <div className="mono" style={{ fontSize: 12 }}>
            {countdown(maturity)}
          </div>
          <div className="termbar">
            <div style={{ width: `${elapsedPct}%` }} />
          </div>
          <dl style={{ marginTop: 12 }}>
            <dt>Market</dt>
            <dd title={market.id}>{market.collateralSymbol}/{market.loanSymbol}</dd>
            <dt>LLTV</dt>
            <dd>{formatWad(BigInt(market.market.collateralParams[0].lltv), 2)}</dd>
            <dt>Oracle</dt>
            <dd>{humanOracle} {market.loanSymbol}</dd>
            <dt>Tick spacing</dt>
            <dd>{tickSpacing ?? "—"}</dd>
            <dt>Withdrawable</dt>
            <dd>{withdrawable !== undefined ? formatUnits(withdrawable, market.loanDecimals) : "—"}</dd>
            <dt>Total units</dt>
            <dd>{totalUnits !== undefined ? formatUnits(totalUnits, market.loanDecimals) : "—"}</dd>
            <dt>Midnight</dt>
            <dd>
              <a href={`${EXPLORER}/address/${ADDRESSES.midnight}`} target="_blank" rel="noreferrer" title={ADDRESSES.midnight}>
                {truncAddr(ADDRESSES.midnight)} ↗
              </a>
            </dd>
            <dt>Ratifier</dt>
            <dd>
              <a href={`${EXPLORER}/address/${ADDRESSES.ratifier}`} target="_blank" rel="noreferrer" title={ADDRESSES.ratifier}>
                {truncAddr(ADDRESSES.ratifier)} ↗
              </a>
            </dd>
          </dl>
        </div>
      )}
    </aside>
  );
}
