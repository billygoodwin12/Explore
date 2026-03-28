'use client';

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

function formatStepLabel(step: string | CausalChainStep): string {
  if (typeof step === 'string') return step;
  return `${step.from} \u2192 ${step.to}`;
}

const dotColors = ['#6B5CE7', '#8B7CF0', '#A99CF5', '#C4B8FA', '#D9D0FC'];

export default function ThesisBlock({
  thesisSummary,
  causalChain,
}: ThesisBlockProps) {
  return (
    <div
      className="rounded-xl p-5 my-3"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Header */}
      <div className="mb-3">
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: '#6B5CE7' }}
        >
          How we see it
        </span>
      </div>

      {/* Summary */}
      <p
        className="mb-4 leading-relaxed"
        style={{ fontSize: '14px', color: '#1a1a1a', lineHeight: 1.65 }}
      >
        {thesisSummary}
      </p>

      {/* Causal Chain — vertical timeline */}
      {causalChain.length > 0 && (
        <div className="relative pl-5">
          {/* Connecting line */}
          <div
            className="absolute left-[7px] top-[6px]"
            style={{
              width: '2px',
              height: 'calc(100% - 12px)',
              backgroundColor: 'rgba(107, 92, 231, 0.15)',
              borderRadius: '1px',
            }}
          />

          <div className="space-y-4">
            {causalChain.map((step, index) => (
              <div key={index} className="relative flex items-start gap-3">
                {/* Dot */}
                <div
                  className="absolute shrink-0 rounded-full"
                  style={{
                    width: '10px',
                    height: '10px',
                    left: '-17px',
                    top: '5px',
                    backgroundColor:
                      dotColors[index % dotColors.length],
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 0 0 1px rgba(107, 92, 231, 0.20)',
                  }}
                />

                {/* Label */}
                <span
                  className="text-sm leading-relaxed"
                  style={{ color: '#444444' }}
                >
                  {formatStepLabel(step)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
