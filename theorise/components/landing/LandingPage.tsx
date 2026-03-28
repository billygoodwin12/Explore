'use client';

import React from 'react';

interface LandingPageProps {
  onStart: () => void;
}

const steps = [
  {
    icon: '💬',
    number: 1,
    title: 'Share your thinking',
    description:
      'Tell us what you believe about the economy, politics, or markets. No jargon needed.',
  },
  {
    icon: '🔍',
    number: 2,
    title: 'Get smart suggestions',
    description:
      'Our AI breaks down your idea and finds relevant investments across futures and predictions.',
  },
  {
    icon: '✅',
    number: 3,
    title: 'Invest with confidence',
    description:
      'Review clear recommendations with plain-English explanations, then act when you\'re ready.',
  },
];

const badges = ['AI-Powered', 'Real Markets', 'No Minimums'];

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div
      className="min-h-screen w-full overflow-y-auto"
      style={{ backgroundColor: '#FAFAF8' }}
    >
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center">
        {/* Brand badge */}
        <span
          className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium mb-8"
          style={{
            backgroundColor: 'rgba(107, 92, 231, 0.08)',
            color: '#6B5CE7',
          }}
        >
          Powered by AI
        </span>

        {/* Heading */}
        <h1
          className="font-bold mb-4"
          style={{
            fontSize: '40px',
            lineHeight: 1.15,
            color: '#1a1a1a',
            maxWidth: '600px',
          }}
        >
          Turn your ideas into investments
        </h1>

        {/* Subtitle */}
        <p
          className="mb-10 max-w-lg"
          style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: '#666666',
          }}
        >
          Tell us what you think is happening in the world. We'll find the trades
          that match.
        </p>

        {/* CTA */}
        <button
          onClick={onStart}
          className="rounded-full font-medium transition-shadow duration-200 hover:shadow-lg"
          style={{
            backgroundColor: '#6B5CE7',
            color: '#FFFFFF',
            padding: '14px 32px',
            fontSize: '16px',
          }}
        >
          Start a conversation &rarr;
        </button>

        {/* Muted helper text */}
        <p className="mt-4" style={{ fontSize: '13px', color: '#999999' }}>
          No account needed to explore
        </p>
      </section>

      {/* How it Works */}
      <section className="px-6 pb-24 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-xl p-6"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(0, 0, 0, 0.06)',
              }}
            >
              {/* Icon + number */}
              <div className="flex items-center gap-3 mb-4">
                <span style={{ fontSize: '24px' }}>{step.icon}</span>
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: 'rgba(107, 92, 231, 0.10)',
                    color: '#6B5CE7',
                  }}
                >
                  {step.number}
                </span>
              </div>

              <h3
                className="font-semibold mb-2"
                style={{ fontSize: '16px', color: '#1a1a1a' }}
              >
                {step.title}
              </h3>
              <p style={{ fontSize: '14px', lineHeight: 1.65, color: '#666666' }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof / Trust */}
      <section className="px-6 pb-32 text-center">
        <p
          className="mb-6"
          style={{ fontSize: '15px', color: '#666666', maxWidth: '480px', margin: '0 auto 24px' }}
        >
          Powered by institutional-grade research, simplified for everyone.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: '#F3F3EE',
                color: '#666666',
                border: '1px solid rgba(0, 0, 0, 0.05)',
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
