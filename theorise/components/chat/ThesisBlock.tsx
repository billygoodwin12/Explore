import React from 'react';

interface ThesisBlockProps {
  thesisSummary: string;
  causalChain: string[];
}

export default function ThesisBlock({
  thesisSummary,
  causalChain,
}: ThesisBlockProps) {
  return (
    <div
      className="rounded-xl p-4 my-3"
      style={{
        backgroundColor: 'rgba(147, 130, 255, 0.05)',
        border: '1px solid rgba(147, 130, 255, 0.12)',
      }}
    >
      {/* Header */}
      <div className="mb-3">
        <span
          className="text-xs uppercase tracking-widest font-bold"
          style={{ color: 'var(--accent-purple, #9382ff)' }}
        >
          Thesis Map
        </span>
      </div>

      {/* Summary */}
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
      >
        {thesisSummary}
      </p>

      {/* Causal Chain */}
      {causalChain.length > 0 && (
        <div className="space-y-2">
          {causalChain.map((step, index) => (
            <div key={index} className="flex items-start gap-2">
              <span
                className="font-mono text-xs font-bold shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(147, 130, 255, 0.12)',
                  color: 'var(--accent-purple, #9382ff)',
                }}
              >
                {index + 1}
              </span>
              <div className="flex items-start gap-2 min-w-0">
                <span
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'var(--text-secondary, rgba(255,255,255,0.55))',
                  }}
                >
                  {step}
                </span>
              </div>
              {index < causalChain.length - 1 && (
                <span
                  className="text-xs shrink-0 mt-0.5"
                  style={{ color: 'var(--accent-purple, #9382ff)' }}
                >
                  &rarr;
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
