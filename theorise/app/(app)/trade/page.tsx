'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { C, D, M, fmt } from '@/styles/tokens';
import { useMarketData } from '@/hooks/useMarketData';
import { usePositions } from '@/hooks/usePositions';
import { placeMarketOrder, updateLeverage, getAssetIndex } from '@/lib/hyperliquid/exchange';
import Chart from '@/components/chart/Chart';

const SLIPPAGE = 0.03; // 3% slippage for market orders

export default function TradePage() {
  const { markets, loading } = useMarketData();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { positions, accountValue, refresh: refreshPositions } = usePositions();

  const [selectedSym, setSelectedSym] = useState('BTC');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [lev, setLev] = useState('3x');
  const [cat, setCat] = useState('all');
  const [sizeUsd, setSizeUsd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const selected = markets.find(m => m.sym === selectedSym) || markets[0];
  const list = cat === 'all' ? markets : markets.filter(p => p.cat === cat);

  const handleSubmit = useCallback(async () => {
    if (!walletClient || !selected || !sizeUsd) return;

    setSubmitting(true);
    setOrderStatus(null);

    try {
      const assetIndex = await getAssetIndex(selected.sym);
      const leverage = parseInt(lev);
      const isBuy = side === 'long';

      // Set leverage first
      await updateLeverage(walletClient, assetIndex, leverage);

      // Calculate size in asset units
      const sizeInAsset = parseFloat(sizeUsd) / selected.price;
      // Round to reasonable precision
      const szDecimals = selected.price > 1000 ? 5 : selected.price > 10 ? 2 : 1;
      const size = sizeInAsset.toFixed(szDecimals);

      // Market order: IOC at slippage price
      const slippagePrice = isBuy
        ? selected.price * (1 + SLIPPAGE)
        : selected.price * (1 - SLIPPAGE);

      // Round price to appropriate precision
      const priceDecimals = selected.price > 1000 ? 0 : selected.price > 10 ? 1 : 4;
      const price = slippagePrice.toFixed(priceDecimals);

      const result = await placeMarketOrder(walletClient, assetIndex, isBuy, size, price);

      if (result.status === 'ok') {
        const statuses = result.response?.data?.statuses;
        if (statuses?.[0]?.filled) {
          const fill = statuses[0].filled;
          setOrderStatus({ type: 'success', msg: `Filled ${fill.totalSz} @ $${fmt(parseFloat(fill.avgPx))}` });
        } else if (statuses?.[0]?.resting) {
          setOrderStatus({ type: 'success', msg: 'Order resting' });
        } else if (statuses?.[0]?.error) {
          setOrderStatus({ type: 'error', msg: statuses[0].error });
        } else {
          setOrderStatus({ type: 'success', msg: 'Order submitted' });
        }
        setSizeUsd('');
        refreshPositions();
      } else {
        setOrderStatus({ type: 'error', msg: result.error || 'Order failed' });
      }
    } catch (e) {
      setOrderStatus({ type: 'error', msg: e instanceof Error ? e.message : 'Order failed' });
    } finally {
      setSubmitting(false);
    }
  }, [walletClient, selected, sizeUsd, side, lev, refreshPositions]);

  if (loading && markets.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: M, fontSize: 13 }}>
        Loading markets...
      </div>
    );
  }

  if (!selected) return null;

  const levOptions = (() => {
    const max = selected.maxLeverage || 20;
    const all = [1, 2, 3, 5, 10, 20, 40];
    return all.filter(l => l <= max).map(l => `${l}x`);
  })();

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Markets sidebar ── */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.card, flexShrink: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, fontFamily: M }}>
            Markets
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {['all', 'crypto'].map(c => (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, textTransform: 'capitalize', fontFamily: D,
                background: cat === c ? C.primary : C.bg,
                color: cat === c ? 'white' : C.secondary,
              }}>{c}</button>
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
              <div style={{ width: 34, height: 34, borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.secondary, fontFamily: M, flexShrink: 0 }}>
                {p.sym}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, fontFamily: D }}>{p.name}</div>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        {/* Market header */}
        <div style={{ padding: '14px 20px', background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, fontFamily: M, color: C.primary }}>
              {selected.sym}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, fontFamily: D }}>
                {selected.name}{' '}
                <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>Perp</span>
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
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.muted, letterSpacing: '0.05em' }}>ACCOUNT</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: M, color: C.primary }}>${fmt(parseFloat(accountValue))}</div>
              </div>
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
          <div style={{ borderTop: `1px solid ${C.border}`, background: C.card, padding: '10px 20px', maxHeight: 180, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8, fontFamily: M }}>
              Open Positions
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: M }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 10 }}>
                  <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Market</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Size</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Entry</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Lev</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>uPnL</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const szi = parseFloat(p.szi);
                  const pnl = parseFloat(p.unrealizedPnl);
                  return (
                    <tr key={p.coin} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: '6px 0', fontWeight: 600, color: C.primary }}>
                        {p.coin}{' '}
                        <span style={{ color: szi > 0 ? C.green : C.red, fontSize: 10 }}>
                          {szi > 0 ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.primary }}>
                        {Math.abs(szi).toFixed(4)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.secondary }}>
                        ${fmt(parseFloat(p.entryPx))}
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', color: C.secondary }}>
                        {p.leverage.value}x
                      </td>
                      <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600, color: pnl >= 0 ? C.green : C.red }}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Order entry ── */}
      <div style={{ width: 260, borderLeft: `1px solid ${C.border}`, background: C.card, flexShrink: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, fontFamily: M }}>Order</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, fontFamily: D }}>{selected.name}</div>
          <div style={{ fontSize: 11, fontFamily: M, color: C.secondary }}>${fmt(selected.price)}</div>
        </div>

        {/* Side toggle */}
        <div style={{ display: 'flex', marginBottom: 14, background: C.bg, borderRadius: 9, padding: 3, border: `1px solid ${C.borderLight}` }}>
          {(['long', 'short'] as const).map(s => (
            <button key={s} onClick={() => setSide(s)} style={{
              flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize', fontFamily: D,
              background: side === s ? C.card : 'transparent',
              color: side === s ? (s === 'long' ? C.green : C.red) : C.muted,
              boxShadow: side === s ? '0 1px 4px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.1s',
            }}>{s}</button>
          ))}
        </div>

        {/* Size input */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, marginBottom: 5, fontFamily: D }}>Size (USD)</div>
          <div style={{ display: 'flex', background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 7, padding: '0 10px' }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: M, lineHeight: '36px' }}>$</span>
            <input
              placeholder="0.00"
              value={sizeUsd}
              onChange={e => setSizeUsd(e.target.value)}
              type="number"
              min="0"
              step="any"
              style={{ flex: 1, border: 'none', background: 'transparent', padding: '9px 6px', fontSize: 13, fontFamily: M, fontWeight: 600, color: C.primary, outline: 'none' }}
            />
          </div>
          {sizeUsd && parseFloat(sizeUsd) > 0 && (
            <div style={{ fontSize: 10, fontFamily: M, color: C.muted, marginTop: 4 }}>
              ~{(parseFloat(sizeUsd) / selected.price).toFixed(4)} {selected.sym}
            </div>
          )}
        </div>

        {/* Quick size buttons */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 14 }}>
          {['50', '100', '250', '500'].map(v => (
            <button key={v} onClick={() => setSizeUsd(v)} style={{
              flex: 1, padding: '5px 0', borderRadius: 5, border: `1px solid ${C.borderLight}`,
              cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: M,
              background: sizeUsd === v ? C.primary : C.bg,
              color: sizeUsd === v ? 'white' : C.secondary,
            }}>${v}</button>
          ))}
        </div>

        {/* Leverage */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.secondary, marginBottom: 5, fontFamily: D }}>Leverage</div>
          <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 7, padding: 2, border: `1px solid ${C.borderLight}` }}>
            {levOptions.map(l => (
              <button key={l} onClick={() => setLev(l)} style={{
                flex: 1, padding: '6px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: M,
                background: lev === l ? C.card : 'transparent',
                color: lev === l ? C.primary : C.muted,
                boxShadow: lev === l ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.1s',
              }}>{l}</button>
            ))}
          </div>
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
          {!isConnected ? (
            <div style={{ textAlign: 'center', fontSize: 11, fontFamily: M, color: C.muted, padding: '12px 0' }}>
              Connect wallet to trade
            </div>
          ) : (
            <>
              <div style={{ fontSize: 9, fontFamily: M, color: C.muted, textAlign: 'center', marginBottom: 6, letterSpacing: '0.05em' }}>
                HYPERLIQUID TESTNET
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !sizeUsd || parseFloat(sizeUsd) <= 0}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, fontFamily: D,
                  background: side === 'long' ? C.green : C.red, color: 'white',
                  opacity: submitting || !sizeUsd || parseFloat(sizeUsd) <= 0 ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {submitting ? 'Submitting...' : `${side === 'long' ? 'Long' : 'Short'} ${selected.sym} ${lev}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
