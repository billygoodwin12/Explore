'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Recommendation, MarketData } from '@/lib/venues/types';
import VenueTag from './VenueTag';
import DirectionBadge from './DirectionBadge';
import ConfidenceBar from './ConfidenceBar';

interface TradeCardProps {
  recommendation: Recommendation;
  marketData: MarketData;
  livePrice?: MarketData;
  index: number;
  selected: boolean;
  onToggle: () => void;
}

export default function TradeCard({
  recommendation,
  marketData,
  livePrice,
  index,
  selected,
  onToggle,
}: TradeCardProps) {
  const [show, setShow] = useState(false);
  const [size, setSize] = useState('100');
  const [lev, setLev] = useState(recommendation.instrument_type === 'perp' ? '1x' : '');
  const [filled, setFilled] = useState(false);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    const tm = setTimeout(() => setShow(true), 60 + index * 80);
    return () => clearTimeout(tm);
  }, [index]);

  // Use live price if available, otherwise fallback to initial market data
  const currentData = livePrice || marketData;
  const price = currentData.price;
  const change24h = currentData.change24h;

  // Flash animation on price change
  useEffect(() => {
    if (prevPriceRef.current !== null && prevPriceRef.current !== price) {
      setFlash(price > prevPriceRef.current ? 'up' : 'down');
      const tm = setTimeout(() => setFlash(null), 600);
      prevPriceRef.current = price;
      return () => clearTimeout(tm);
    }
    prevPriceRef.current = price;
  }, [price]);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const isPerp = recommendation.instrument_type === 'perp';

  const flashColor = flash === 'up' ? 'rgba(22, 163, 74, 0.08)' : flash === 'down' ? 'rgba(220, 38, 38, 0.08)' : undefined;
  const priceColor = flash === 'up' ? '#16a34a' : flash === 'down' ? '#dc2626' : '#1a1917';

  return (
    <div
      onClick={() => !filled && onToggle()}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(6px)',
        transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
        background: filled ? '#f0fdf4' : flashColor || (selected ? '#fafaf8' : 'white'),
        border: `1px solid ${filled ? '#bbf7d0' : selected ? '#e2e0db' : '#eeedea'}`,
        borderRadius: 12,
        padding: '14px 16px',
        cursor: filled ? 'default' : 'pointer',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Checkbox */}
        <div style={{
          width: 20, height: 20, borderRadius: 6, marginTop: 1, flexShrink: 0,
          border: `2px solid ${filled ? '#22c55e' : selected ? '#7c3aed' : '#d5d3cf'}`,
          background: filled ? '#22c55e' : selected ? '#7c3aed' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}>
          {(selected || filled) && (
            <span style={{ fontSize: 12, color: 'white', lineHeight: 1 }}>✓</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <VenueTag venue={recommendation.venue} />
            <DirectionBadge direction={recommendation.direction} instrumentType={recommendation.instrument_type} />
            {filled && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', fontFamily: 'var(--mono)' }}>
                Filled ✓
              </span>
            )}
            {livePrice && !filled && (
              <span style={{
                fontSize: 9, fontWeight: 600, color: '#16a34a', fontFamily: 'var(--mono)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#16a34a',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
                LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1917', marginBottom: 3, letterSpacing: '-0.01em' }}>
            {recommendation.name}
          </div>
          <div style={{ fontSize: 12.5, color: '#8a8680', lineHeight: 1.55 }}>
            {recommendation.rationale}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 90 }}>
          <div style={{
            fontSize: 17, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
            color: priceColor,
            transition: 'color 0.3s ease',
          }}>
            ${formatPrice(price)}
          </div>
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, marginTop: 3,
            color: change24h >= 0 ? '#16a34a' : '#dc2626',
          }}>
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
          </div>
          <div style={{ marginTop: 6 }}>
            <ConfidenceBar confidence={recommendation.conviction} />
          </div>
        </div>
      </div>

      {/* Expanded */}
      {selected && !filled && (
        <div
          style={{
            marginTop: 14, paddingTop: 12, borderTop: '1px solid #eeedea',
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'slideUp 0.2s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: '#f7f6f3', borderRadius: 8, padding: '0 2px 0 10px',
            border: '1px solid #eeedea',
          }}>
            <span style={{ fontSize: 12, color: '#8a8680', fontFamily: 'var(--mono)' }}>$</span>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 60, background: 'transparent', border: 'none',
                padding: '7px 6px', color: '#1a1917', fontSize: 13,
                fontFamily: 'var(--mono)', outline: 'none', fontWeight: 600,
              }}
            />
          </div>

          {isPerp && (
            <div style={{
              display: 'flex', gap: 2, background: '#f7f6f3',
              borderRadius: 8, padding: 2, border: '1px solid #eeedea',
            }}>
              {['1x', '2x', '3x', '5x', '10x'].map((l) => (
                <button
                  key={l}
                  onClick={(e) => { e.stopPropagation(); setLev(l); }}
                  style={{
                    padding: '5px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    fontFamily: 'var(--mono)', border: 'none', cursor: 'pointer',
                    background: lev === l ? 'white' : 'transparent',
                    color: lev === l ? '#1a1917' : '#a8a49e',
                    boxShadow: lev === l ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.12s ease',
                  }}
                >{l}</button>
              ))}
            </div>
          )}

          <div style={{ flex: 1 }} />

          <button
            onClick={(e) => { e.stopPropagation(); setFilled(true); }}
            style={{
              background: '#1a1917', border: 'none', borderRadius: 8, padding: '8px 22px',
              fontSize: 12.5, fontWeight: 700, color: 'white', cursor: 'pointer',
              transition: 'all 0.15s ease', letterSpacing: '0.01em',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#2d2c28'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#1a1917'; }}
          >
            Execute
          </button>
        </div>
      )}
    </div>
  );
}
