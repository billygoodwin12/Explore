'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { C, D, M } from '@/styles/tokens';

export default function LandingPage() {
  const [vis, setVis] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setVis(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      height: '100vh',
      background: `linear-gradient(155deg, ${C.hero1} 0%, ${C.hero2} 45%, ${C.hero3} 100%)`,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Geometric lines */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${5 + i * 5.5}%`,
            top: '-10%',
            width: 1,
            height: '130%',
            background: `linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.03) 40%, rgba(255,255,255,0.015) 70%, transparent 100%)`,
            transform: `rotate(-15deg)`,
          }} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <div key={`h${i}`} style={{
            position: 'absolute',
            top: `${10 + i * 12}%`,
            left: '-5%',
            width: '110%',
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, rgba(159,179,200,0.06) 30%, rgba(159,179,200,0.02) 70%, transparent 100%)`,
          }} />
        ))}
      </div>

      {/* Header */}
      <div style={{
        padding: '0 40px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: D,
          }}>T</div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: D, letterSpacing: '-0.02em' }}>
            Theorise
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: M, letterSpacing: '0.05em' }}>
          POWERED BY HYPERLIQUID
        </span>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 40px',
        position: 'relative',
        zIndex: 2,
        maxWidth: 800,
      }}>
        <div style={{
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(24px)',
          transition: 'all 0.9s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <h1 style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.0,
            letterSpacing: '-0.04em',
            color: 'rgba(255,255,255,0.95)',
            fontFamily: D,
            margin: '0 0 24px',
          }}>
            Trade your<br />convictions.
          </h1>
          <p style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.4)',
            fontFamily: D,
            margin: '0 0 40px',
            maxWidth: 440,
          }}>
            Perpetual futures across crypto, commodities, and indices.
            Package your positions into vaults. Let others invest in your edge.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => router.push('/trade')}
              style={{
                padding: '14px 32px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, fontFamily: D, letterSpacing: '-0.01em',
                background: 'white', color: C.primary,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
            >
              Launch App
            </button>
            <button style={{
              padding: '14px 28px', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontWeight: 600, fontFamily: D,
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)', transition: 'all 0.15s ease',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
            >
              Learn more
            </button>
          </div>
        </div>
      </div>

      {/* Bottom stats bar */}
      <div style={{
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { label: '24h Volume', value: '$847M' },
            { label: 'Open Interest', value: '$4.2B' },
            { label: 'Active Vaults', value: '142' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 10, fontFamily: M, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {s.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: M, color: 'rgba(255,255,255,0.8)', letterSpacing: '-0.02em', marginTop: 2 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, fontFamily: M, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
          THEORISE ©2026
        </div>
      </div>
    </div>
  );
}
