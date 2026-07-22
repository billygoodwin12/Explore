import { useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { MARKETS, type MarketInfo } from "@shared/deployments";
import { CHAIN_ID } from "@shared/deployments";
import { truncAddr } from "./lib/format";
import { ToastProvider } from "./toast";
import { MarketRail } from "./components/MarketRail";
import { QuotesTab } from "./components/QuotesTab";
import { MakeTab } from "./components/MakeTab";
import { PositionTab } from "./components/PositionTab";
import { FaucetTab } from "./components/FaucetTab";

const TABS = ["Quotes", "Make", "Position", "Faucet"] as const;
type Tab = (typeof TABS)[number];

const DESK_A = (import.meta.env.VITE_DESK_A ?? "").toLowerCase();
const DESK_B = (import.meta.env.VITE_DESK_B ?? "").toLowerCase();

function deskLabel(address?: string): string | null {
  if (!address) return null;
  const a = address.toLowerCase();
  if (DESK_A && a === DESK_A) return "Desk A — Maker";
  if (DESK_B && a === DESK_B) return "Desk B — Taker";
  return null;
}

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [collateralSym, setCollateralSym] = useState("mWETH");
  const [loanSym, setLoanSym] = useState("mUSDC");
  const [tab, setTab] = useState<Tab>("Quotes");

  const market: MarketInfo | undefined = useMemo(
    () => MARKETS.find((m) => m.collateralSymbol === collateralSym && m.loanSymbol === loanSym),
    [collateralSym, loanSym],
  );

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const desk = deskLabel(address);

  return (
    <ToastProvider>
      <div className="app">
        <header className="header">
          <span className="wordmark">
            <span className="moon" />
            MIDNIGHT RFQ
          </span>
          <span className="chain-badge">Base Sepolia · {CHAIN_ID}</span>
          <span className="spacer" />
          {desk && <span className="desk-chip">{desk}</span>}
          {isConnected ? (
            <button className="mono" onClick={() => disconnect()} title="Disconnect">
              {truncAddr(address ?? "")}
            </button>
          ) : (
            <button className="primary" onClick={() => connect({ connector: connectors[0] })}>
              Connect
            </button>
          )}
        </header>

        {wrongChain ? (
          <div className="blocking">
            <div>Wrong network. This desk trades on Base Sepolia only.</div>
            <button className="primary" onClick={() => switchChain({ chainId: CHAIN_ID })}>
              Switch to Base Sepolia
            </button>
          </div>
        ) : (
          <div className="main">
            <MarketRail
              collateralSym={collateralSym}
              loanSym={loanSym}
              setCollateralSym={setCollateralSym}
              setLoanSym={setLoanSym}
              market={market}
            />
            <div className="pane">
              <div className="tabs">
                {TABS.map((t) => (
                  <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              {!market ? (
                <div className="empty">No market for this pair.</div>
              ) : tab === "Quotes" ? (
                <QuotesTab market={market} />
              ) : tab === "Make" ? (
                <MakeTab market={market} />
              ) : tab === "Position" ? (
                <PositionTab market={market} />
              ) : (
                <FaucetTab />
              )}
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
