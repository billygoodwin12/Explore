'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { C, D, M, fmt } from '@/styles/tokens';
import { useMarketData } from '@/hooks/useMarketData';
import { usePositions } from '@/hooks/usePositions';
import { useDeposit } from '@/hooks/useDeposit';
import { placeMarketOrder, updateLeverage, closePosition } from '@/lib/hyperliquid/exchange';
import { ensureAgentApproved } from '@/lib/hyperliquid/agentWallet';
import Chart from '@/components/chart/Chart';
import AssetIcon from '@/components/AssetIcon';

const SLIPPAGE = 0.03;

export default function TradePage() {
  const { markets, loading } = useMarketData();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { positions, accountValue, withdrawable, spotUsdcTotal, spotUsdcAvailable, refresh: refreshPositions } = usePositions();
  const { usdcBalance, depositing, deposit, isReady: depositReady, isWrongChain, switchToArbitrum } = useDeposit();

  const [selectedSym, setSelectedSym] = useState('BTC');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [lev, setLev] = useState<number>(3);
  const [cat, setCat] = useState<'all' | 'crypto' | 'hip3'>('all');
  const [sizeAsset, setSizeAsset] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmt, setDepositAmt] = useState('');
  const [depositStatus, setDepositStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [closingCoin, setClosingCoin] = useState<string | null>(null);

  const selected = markets.find(m => m.sym === selectedSym) || markets[0];
  const list = cat === 'all' ? markets : markets.filter(p => p.cat === cat);

  const handleSubmit = useCallback(async () => {
    if (!walletClient || !selected || !sizeAsset) return;
    const sizeAssetNum = parseFloat(sizeAsset);
    if (!Number.isFinite(sizeAssetNum) || sizeAssetNum <= 0) return;

    if (!confirm) {
      setConfirm(true);
      return;
    }

    setSubmitting(true);
    setOrderStatus(null);
    setConfirm(false);

    try {
      const agent = await ensureAgentApproved(walletClient);

      const assetIndex = selected.assetIndex;
      const leverage = Math.min(Math.max(1, lev), selected.maxLeverage || 20);
      const isBuy = side === 'long';

      // Truncate to the asset's lot precision so what we submit matches
      // exactly what the user sees in the Order Value readout.
      const szDecimals = selected.szDecimals;
      const factor = Math.pow(10, szDecimals);
      const truncated = Math.floor(sizeAssetNum * factor) / factor;
      const size = truncated.toFixed(szDecimals);

      if (truncated <= 0) {
        setOrderStatus({ type: 'error', msg: `Size below lot precision (10^-${szDecimals} ${selected.sym}).` });
        setSubmitting(false);
        return;
      }

      // Hyperliquid enforces a $10 minimum NOTIONAL per order (not IM).
      const notional = truncated * selected.price;
      if (notional < 10) {
        setOrderStatus({
          type: 'error',
          msg: `Minimum order is $10 notional. Current: $${notional.toFixed(2)} — increase size.`,
        });
        setSubmitting(false);
        return;
      }

      // Hyperliquid rejects `updateLeverage` on HIP-3 perp asset ids
      // ("Invalid spot") — their own UI skips the call on HIP-3 dexes
      // and the order lands with whatever leverage the account already
      // has on that dex. Match that behavior.
      if (!selected.dex) {
        const levResult = await updateLeverage(agent, assetIndex, leverage);
        if (levResult.status !== 'ok') {
          const errMsg = typeof levResult.response === 'string' ? levResult.response : (levResult.error || JSON.stringify(levResult));
          setOrderStatus({ type: 'error', msg: `Leverage: ${errMsg}` });
          setSubmitting(false);
          return;
        }
      }

      const slippagePrice = isBuy
        ? selected.price * (1 + SLIPPAGE)
        : selected.price * (1 - SLIPPAGE);
      const priceDecimals = selected.price > 1000 ? 0 : selected.price > 10 ? 1 : 4;
      const price = slippagePrice.toFixed(priceDecimals);

      const result = await placeMarketOrder(agent, assetIndex, isBuy, size, price);

      if (result.status === 'ok') {
        const resp = typeof result.response === 'object' ? result.response : undefined;
        const statuses = resp?.data?.statuses;
        if (statuses?.[0]?.filled) {
          const fill = statuses[0].filled;
          setOrderStatus({ type: 'success', msg: `Filled ${fill.totalSz} @ $${fmt(parseFloat(fill.avgPx))}` });
        } else if (statuses?.[0]?.error) {
          setOrderStatus({ type: 'error', msg: statuses[0].error });
        } else {
          setOrderStatus({ type: 'success', msg: 'Order submitted' });
        }
        setSizeAsset('');
        refreshPositions();
      } else {
        const errMsg = typeof result.response === 'string' ? result.response : (result.error || JSON.stringify(result.response || result));
        setOrderStatus({ type: 'error', msg: errMsg });
      }
    } catch (e) {
      let msg = e instanceof Error ? e.message : (typeof e === 'object' ? JSON.stringify(e) : String(e));
      // Friendly error messages
      if (msg.includes('chainId') && msg.includes('1337')) {
        msg = 'Signing error — please disconnect and reconnect your wallet, then try again.';
      } else if (msg.includes('4100') || msg.includes('not been authorized')) {
        msg = 'Wallet not authorized — please disconnect and reconnect your wallet.';
      } else if (msg.includes('User rejected') || msg.includes('user rejected')) {
        msg = 'Transaction rejected by user.';
      }
      setOrderStatus({ type: 'error', msg: msg.length > 200 ? msg.slice(0, 200) : msg });
    } finally {
      setSubmitting(false);
    }
  }, [walletClient, selected, sizeAsset, side, lev, confirm, refreshPositions]);

  const handleClose = useCallback(async (pos: typeof positions[0]) => {
    if (!walletClient) return;
    setClosingCoin(pos.coin);
    try {
      const agent = await ensureAgentApproved(walletClient);
      const midPrice = markets.find(m => m.sym === pos.coin)?.price || parseFloat(pos.entryPx);
      await closePosition(agent, pos.coin, parseFloat(pos.szi), midPrice);
      refreshPositions();
    } catch {
      // error handled silently
    } finally {
      setClosingCoin(null);
    }
  }, [walletClient, markets, refreshPositions]);

  const handleDeposit = useCallback(async () => {
    if (!depositAmt) return;
    setDepositStatus(null);
    try {
      await deposit(depositAmt);
      setDepositStatus({ type: 'success', msg: `Deposited ${depositAmt} USDC — credits in ~1 min` });
      setDepositAmt('');
      // Poll for balance update every 5s for 2 minutes
      let polls = 0;
      const pollInterval = setInterval(() => {
        refreshPositions();
        polls++;
        if (polls >= 24) clearInterval(pollInterval);
      }, 5000);
    } catch (e) {
      setDepositStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Deposit failed' });
    }
  }, [depositAmt, deposit, refreshPositions]);

  if (loading && markets.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: M, fontSize: 13 }}>
        Loading markets...
      </div>
    );
  }

  if (!selected) return null;

  const maxLev = selected.maxLeverage || 20;
  // Clamp selected leverage to the market's max whenever the market changes
  const effectiveLev = Math.min(Math.max(1, lev), maxLev);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Markets sidebar ── */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.card, flexShrink: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, fontFamily: M }}>
            Markets
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {(['all', 'crypto', 'hip3'] as const).map(c => (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, fontFamily: D,
                background: cat === c ? C.primary : C.bg,
                color: cat === c ? 'white' : C.secondary,
              }}>{c === 'hip3' ? 'HIP-3' : c === 'all' ? 'All' : 'Crypto'}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
          {list.map(p => (
            <div key={p.sym} onClick={() => setSelectedSym(p.sym)} style={{
              display: 'flex', alignItems: 'center', padding: '9px 10px', gap: 10,
              cursor: 'pointer', borderRadius: 8,
              background: selected.sym === p.sym ? C.bg : 'transparent',
              border: `1px solid ${selected.sym === p.sym ? C.border : 'transparent'}`,
              transition: 'all 0.1s',
            }}>
              <AssetIcon sym={p.displaySym} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, fontFamily: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  {p.dex && (
                    <span style={{ fontSize: 8, fontWeight: 700, fontFamily: M, padding: '1px 4px', borderRadius: 3, background: C.borderLight, color: C.muted, letterSpacing: '0.04em', flexShrink: 0 }}>
                      HIP-3
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: M }}>
                  Fund: {p.funding >= 0 ? '+' : ''}{(p.funding * 100).toFixed(4)}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary }}>${fmt(p.price)}</div>
                <div style={{ fontSize: 10, fontWeight: 600, fontFamily: M, color: p.chg >= 0 ? C.green : C.red }}>
                  {p.chg >= 0 ? '+' : ''}{p.chg}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart + Positions ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg, minWidth: 0 }}>
        {/* Market header */}
        <div style={{ padding: '14px 20px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AssetIcon sym={selected.displaySym} size={40} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, fontFamily: D, display: 'flex', alignItems: 'center', gap: 6 }}>
                {selected.name}{' '}
                <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>Perp</span>
                {selected.dex && (
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: M, padding: '2px 6px', borderRadius: 4, background: C.borderLight, color: C.muted }}>
                    HIP-3
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: M, color: C.secondary, marginTop: 1 }}>
                <span>OI ${selected.oi}</span>
                <span>Funding {selected.funding >= 0 ? '+' : ''}{(selected.funding * 100).toFixed(4)}%</span>
                <span>Max {selected.maxLeverage}x</span>
              </div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
            {isConnected && (
              <>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontFamily: M, color: C.muted, letterSpacing: '0.05em' }}>TOTAL</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary }}>${fmt(parseFloat(accountValue) + parseFloat(spotUsdcTotal))}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontFamily: M, color: C.muted, letterSpacing: '0.05em' }}>AVAILABLE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.green }}>${fmt(parseFloat(withdrawable) + parseFloat(spotUsdcAvailable))}</div>
                </div>
              </>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: M, color: C.primary, letterSpacing: '-0.03em' }}>
                ${fmt(selected.price)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: selected.chg >= 0 ? C.green : C.red }}>
                {selected.chg >= 0 ? '+' : ''}{selected.chg}%
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: 1, padding: 16, minHeight: 0 }}>
          <Chart coin={selected.sym} />
        </div>

        {/* Positions panel */}
        {isConnected && positions.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}`, background: C.card, padding: '10px 20px', maxHeight: 200, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, fontFamily: M }}>
              Open Positions ({positions.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: M }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Market</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Size</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Entry</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Mark</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Lev</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>uPnL</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>ROE</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Liq</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const szi = parseFloat(p.szi);
                  const pnl = parseFloat(p.unrealizedPnl);
                  const roe = parseFloat(p.returnOnEquity) * 100;
                  const markPrice = markets.find(m => m.sym === p.coin)?.price;
                  return (
                    <tr key={p.coin} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: '6px 0', fontWeight: 600, color: C.primary }}>
                        {p.coin}{' '}
                        <span style={{ color: szi > 0 ? C.green : C.red, fontSize: 10 }}>
                          {szi > 0 ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.primary }}>
                        {Math.abs(szi)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.secondary }}>
                        ${fmt(parseFloat(p.entryPx))}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.primary }}>
                        {markPrice ? `$${fmt(markPrice)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.secondary }}>
                        {p.leverage.value}x
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600, color: pnl >= 0 ? C.green : C.red }}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600, color: roe >= 0 ? C.green : C.red }}>
                        {roe >= 0 ? '+' : ''}{roe.toFixed(1)}%
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.muted, fontSize: 10 }}>
                        {p.liquidationPx ? `$${fmt(parseFloat(p.liquidationPx))}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }}>
                        <button
                          onClick={() => handleClose(p)}
                          disabled={closingCoin === p.coin}
                          style={{
                            padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.red}`,
                            background: 'transparent', color: C.red, fontSize: 10, fontWeight: 600,
                            fontFamily: M, cursor: 'pointer', opacity: closingCoin === p.coin ? 0.5 : 1,
                          }}
                        >
                          {closingCoin === p.coin ? '...' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Order entry + Deposit ── */}
      <div style={{ width: 280, borderLeft: `1px solid ${C.border}`, background: C.card, flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Account / Deposit section */}
        {isConnected && (
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, fontFamily: M }}>Account</div>
              <button
                onClick={() => setShowDeposit(!showDeposit)}
                style={{
                  padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.green}`,
                  background: showDeposit ? C.greenBg : 'transparent',
                  color: C.green, fontSize: 10, fontWeight: 700, fontFamily: M, cursor: 'pointer',
                }}
              >
                Deposit
              </button>
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginBottom: 4 }}>PERPS</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: M, marginBottom: 3 }}>
              <span style={{ color: C.muted }}>Equity</span>
              <span style={{ color: C.primary, fontWeight: 600 }}>${fmt(parseFloat(accountValue))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: M, marginBottom: 3 }}>
              <span style={{ color: C.muted }}>Available</span>
              <span style={{ color: C.green, fontWeight: 600 }}>${fmt(parseFloat(withdrawable))}</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>SPOT</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: M, marginBottom: 3 }}>
              <span style={{ color: C.muted }}>USDC Balance</span>
              <span style={{ color: C.primary, fontWeight: 600 }}>${fmt(parseFloat(spotUsdcTotal))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: M, marginBottom: 3 }}>
              <span style={{ color: C.muted }}>Available</span>
              <span style={{ color: C.green, fontWeight: 600 }}>${fmt(parseFloat(spotUsdcAvailable))}</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>WALLET</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: M }}>
              <span style={{ color: C.muted }}>Arb USDC</span>
              <span style={{ color: C.secondary, fontWeight: 600 }}>{fmt(parseFloat(usdcBalance))}</span>
            </div>

            {showDeposit && (
              <div style={{ marginTop: 10, padding: '10px', background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.secondary, marginBottom: 6 }}>
                  Deposit USDC from Arbitrum One (min 5 USDC)
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <div style={{ display: 'flex', flex: 1, background: C.card, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: '0 8px' }}>
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: M, lineHeight: '32px' }}>$</span>
                    <input
                      placeholder="0.00"
                      value={depositAmt}
                      onChange={e => setDepositAmt(e.target.value)}
                      type="number"
                      min="5"
                      style={{ flex: 1, border: 'none', background: 'transparent', padding: '7px 4px', fontSize: 12, fontFamily: M, fontWeight: 600, color: C.primary, outline: 'none', width: 0 }}
                    />
                  </div>
                  <button
                    onClick={() => setDepositAmt(usdcBalance)}
                    style={{ padding: '0 8px', borderRadius: 6, border: `1px solid ${C.borderLight}`, background: C.card, fontSize: 10, fontFamily: M, color: C.secondary, cursor: 'pointer' }}
                  >
                    MAX
                  </button>
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={depositing || !depositAmt || parseFloat(depositAmt) < 5}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: M,
                    background: C.green, color: 'white',
                    opacity: depositing || !depositAmt || parseFloat(depositAmt) < 5 ? 0.5 : 1,
                  }}
                >
                  {depositing ? 'Depositing...' : 'Deposit USDC'}
                </button>
                {isWrongChain && !depositing && (
                  <button
                    onClick={switchToArbitrum}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 6, border: `1px solid ${C.accent}`,
                      background: 'transparent', color: C.accent, fontSize: 10, fontWeight: 700,
                      fontFamily: M, cursor: 'pointer', marginTop: 6,
                    }}
                  >
                    Switch to Arbitrum One
                  </button>
                )}
                {depositStatus && (
                  <div style={{
                    marginTop: 6, fontSize: 10, fontFamily: M,
                    color: depositStatus.type === 'success' ? C.green : C.red,
                  }}>
                    {depositStatus.msg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Order section */}
        <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, fontFamily: M }}>Order</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, fontFamily: D }}>{selected.name}</div>
            <div style={{ fontSize: 11, fontFamily: M, color: C.secondary }}>${fmt(selected.price)}</div>
          </div>

          {/* Side toggle */}
          <div style={{ display: 'flex', marginBottom: 14, background: C.bg, borderRadius: 9, padding: 3, border: `1px solid ${C.borderLight}` }}>
            {(['long', 'short'] as const).map(s => (
              <button key={s} onClick={() => { setSide(s); setConfirm(false); }} style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700, textTransform: 'capitalize', fontFamily: D,
                background: side === s ? C.card : 'transparent',
                color: side === s ? (s === 'long' ? C.green : C.red) : C.muted,
                boxShadow: side === s ? '0 1px 4px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.1s',
              }}>{s}</button>
            ))}
          </div>

          {/* Size input — denominated in the base asset */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D }}>Size</div>
              <div style={{ fontSize: 9, fontFamily: M, color: C.muted }}>min $10 notional</div>
            </div>
            <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 7, padding: '0 10px', alignItems: 'center' }}>
              <input
                placeholder={`0.${'0'.repeat(Math.max(0, selected.szDecimals - 1))}1`}
                value={sizeAsset}
                onChange={e => { setSizeAsset(e.target.value); setConfirm(false); }}
                type="number"
                min="0"
                step={Math.pow(10, -selected.szDecimals)}
                style={{ flex: 1, border: 'none', background: 'transparent', padding: '9px 0', fontSize: 13, fontFamily: M, fontWeight: 600, color: C.primary, outline: 'none' }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: M, marginLeft: 6 }}>{selected.sym}</span>
            </div>
          </div>


          {/* Leverage slider */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, fontFamily: D }}>Leverage</div>
              <div style={{ fontSize: 12, fontWeight: 700, fontFamily: M, color: C.primary }}>{effectiveLev}×</div>
            </div>
            <input
              type="range"
              min={1}
              max={maxLev}
              step={1}
              value={effectiveLev}
              onChange={e => { setLev(parseInt(e.target.value)); setConfirm(false); }}
              style={{ width: '100%', accentColor: C.primary }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: M, color: C.muted, marginTop: 2 }}>
              <span>1×</span>
              <span>{maxLev}×</span>
            </div>
            {selected.dex && (
              <div style={{ fontSize: 9, fontFamily: M, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
                HIP-3 dex: leverage is controlled per-dex on Hyperliquid, not per-order. Slider here only affects the Margin Required preview below.
              </div>
            )}
          </div>

          {/* Order status */}
          {orderStatus && (
            <div style={{
              marginBottom: 10, padding: '8px 10px', borderRadius: 7, fontSize: 11, fontFamily: M,
              background: orderStatus.type === 'success' ? C.greenBg : C.redBg,
              color: orderStatus.type === 'success' ? C.greenTxt : C.redTxt,
            }}>
              {orderStatus.msg}
            </div>
          )}

          {/* Submit */}
          <div style={{ marginTop: 'auto' }}>
            {(() => {
              const sizeNum = parseFloat(sizeAsset);
              const validSize = Number.isFinite(sizeNum) && sizeNum > 0;
              const levNum = effectiveLev;
              const orderValue = validSize ? sizeNum * selected.price : 0;
              const marginRequired = validSize ? orderValue / levNum : 0;
              const belowMin = validSize && orderValue < 10;
              const submitDisabled = !validSize || submitting || belowMin;

              return (
                <>
                  {/* Derived quote-currency readout */}
                  <div style={{
                    borderTop: `1px solid ${C.borderLight}`,
                    paddingTop: 10, marginBottom: 10, fontSize: 11, fontFamily: M,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: C.muted }}>Liquidation Price</span>
                      <span style={{ color: C.secondary, fontWeight: 600 }}>N/A</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: C.muted }}>Order Value</span>
                      <span style={{ color: C.primary, fontWeight: 600 }}>
                        {validSize ? `${orderValue.toFixed(2)} USDC` : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.muted }}>Margin Required</span>
                      <span style={{ color: C.primary, fontWeight: 600 }}>
                        {validSize ? `${marginRequired.toFixed(2)} USDC` : '—'}
                      </span>
                    </div>
                    {belowMin && (
                      <div style={{ marginTop: 6, fontSize: 10, color: C.red }}>
                        Below $10 notional minimum.
                      </div>
                    )}
                  </div>

                  {!isConnected ? (
                    <div style={{ textAlign: 'center', fontSize: 11, fontFamily: M, color: C.muted, padding: '12px 0' }}>
                      Connect wallet to trade
                    </div>
                  ) : (
                    <>
                      {confirm && (
                        <div style={{
                          marginBottom: 8, padding: '8px 10px', borderRadius: 7, fontSize: 10, fontFamily: M,
                          background: '#FFF8E6', border: '1px solid #F0D060', color: '#8B6E00',
                        }}>
                          MAINNET — This will trade real funds. Click again to confirm.
                        </div>
                      )}
                      <button
                        onClick={handleSubmit}
                        disabled={submitDisabled}
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                          fontSize: 13, fontWeight: 700, fontFamily: D,
                          background: confirm ? '#D4A017' : (side === 'long' ? C.green : C.red),
                          color: 'white',
                          opacity: submitDisabled ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {submitting ? 'Submitting...' : confirm ? 'Confirm Order' : `${side === 'long' ? 'Long' : 'Short'} ${selected.displaySym} ${effectiveLev}×`}
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
