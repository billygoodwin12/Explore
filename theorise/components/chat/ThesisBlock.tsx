import React from 'react';

interface CausalChainStep {
  from: string;
  to: string;
  mechanism: string;
  confidence: number;
}

interface ThesisBlockProps {
  thesisSummary: string;
  causalChain: (string | CausalChainStep)[];
}

function formatStep(step: string | CausalChainStep): string {
  if (typeof step === 'string') return step;
  return `${step.from} \u2192 ${step.to}`;
}

export default function ThesisBlock({
  thesisSummary,
  causalChain,
}: ThesisBlockProps) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        background: '#faf9f7',
        border: '1px solid #eeedea',
        borderRadius: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          color: '#b5b1ab',
          marginBottom: 10,
          fontFamily: 'var(--mono)',
        }}
      >
        HOW WE SEE IT
      </div>

      {/* Steps */}
      {causalChain.map((step, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 10,
            marginBottom: index < causalChain.length - 1 ? 8 : 0,
          }}
        >
          {/* Number box */}
          <div
            style={{
              width: 18,
              height: 18,
              minWidth: 18,
              borderRadius: 5,
              background: '#ffffff',
              border: '1px solid #e2e0db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#8a8680',
              fontFamily: 'var(--mono)',
            }}
          >
            {index + 1}
          </div>

          {/* Text */}
          <span
            style={{
              fontSize: 13,
              color: '#5c5955',
              lineHeight: 1.5,
            }}
          >
            {formatStep(step)}
          </span>
        </div>
      ))}
    </div>
  );
}
