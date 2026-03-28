import React from 'react';

interface ConfidenceBarProps {
  confidence: number;
}

function getColor(confidence: number): string {
  if (confidence > 80) return '#22c55e';
  if (confidence >= 65) return '#f59e0b';
  return '#ef4444';
}

export default function ConfidenceBar({ confidence }: ConfidenceBarProps) {
  const color = getColor(confidence);
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: '60px',
          height: '4px',
          backgroundColor: 'rgba(0, 0, 0, 0.06)',
        }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${clampedConfidence}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span
        className="font-mono text-xs font-bold"
        style={{ color }}
      >
        {clampedConfidence}%
      </span>
    </div>
  );
}
