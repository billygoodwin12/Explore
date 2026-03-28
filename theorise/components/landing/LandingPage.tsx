'use client';

import React, { useState, useEffect } from 'react';

interface LandingPageProps {
  onStart: () => void;
}

const steps = [
  {
    number: 1,
    label: 'Share your thinking',
    desc: 'Tell us what you believe about the economy, politics, or markets. No jargon needed.',
  },
  {
    number: 2,
    label: 'Get smart suggestions',
    desc: 'Our AI breaks down your idea and finds relevant investments across futures and predictions.',
  },
  {
    number: 3,
    label: 'Invest with confidence',
    desc: "Review clear recommendations with plain-English explanations, then act when you're ready.",
  },
];

const tags = ['AI-Powered', 'Real Markets', 'No Minimums'];

export default function LandingPage({ onStart }: LandingPageProps) {
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVis(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: '#1a1917',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 800,
          marginBottom: 24,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        T
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: 42,
          fontWeight: 700,
          lineHeight: 1.12,
          letterSpacing: '-0.035em',
          color: '#1a1917',
          textAlign: 'center',
          whiteSpace: 'pre-line',
          marginBottom: 16,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {'Turn your ideas\ninto investments'}
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 16,
          color: '#8a8680',
          maxWidth: 400,
          textAlign: 'center',
          lineHeight: 1.6,
          marginBottom: 28,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        Tell us what you think is happening in the world. We&apos;ll find the trades that match.
      </p>

      {/* CTA */}
      <button
        onClick={onStart}
        style={{
          background: '#1a1917',
          borderRadius: 12,
          padding: '14px 32px',
          fontSize: 15,
          fontWeight: 600,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          marginBottom: 12,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#2d2c28';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#1a1917';
        }}
      >
        Start a conversation &rarr;
      </button>

      {/* Helper text */}
      <p
        style={{
          fontSize: 12,
          color: '#b5b1ab',
          marginBottom: 0,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        No account needed to explore
      </p>

      {/* Steps */}
      <div
        style={{
          marginTop: 64,
          display: 'flex',
          gap: 32,
          justifyContent: 'center',
          flexWrap: 'wrap',
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {steps.map((step) => (
          <div
            key={step.number}
            style={{
              width: 200,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#f3f2ef',
                border: '1px solid #eeedea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#7c3aed',
                fontFamily: 'var(--mono)',
                marginBottom: 4,
              }}
            >
              {step.number}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1917' }}>
              {step.label}
            </div>
            <div style={{ fontSize: 12.5, color: '#a8a49e', lineHeight: 1.55 }}>
              {step.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div
        style={{
          marginTop: 48,
          display: 'flex',
          gap: 8,
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#b5b1ab',
              background: '#f3f2ef',
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <p
        style={{
          position: 'absolute',
          bottom: 24,
          fontSize: 11,
          color: '#ccc9c3',
          opacity: vis ? 1 : 0,
          transform: vis ? 'translateY(0)' : 'translateY(4px)',
          transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        Powered by institutional-grade research, simplified for everyone.
      </p>
    </div>
  );
}
