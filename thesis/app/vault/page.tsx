'use client';

import React, { useState } from 'react';

export default function VaultPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    // Stub: would POST to /api/vault/waitlist
    setSubmitted(true);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--bg-primary, #0a0a0f)' }}
    >
      <div className="max-w-md w-full text-center">
        <h1
          className="text-3xl font-bold mb-4"
          style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
        >
          Vaults &mdash; Coming Soon
        </h1>

        <p
          className="mb-8 leading-relaxed"
          style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
        >
          Deposit into curated strategy vaults that automatically execute
          thesis-driven trades across Hyperliquid and Polymarket. Earn yield
          while your macro view plays out.
        </p>

        {submitted ? (
          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'var(--accent-green-dim, rgba(52,211,153,0.12))',
              border: '1px solid var(--accent-green, #34d399)',
            }}
          >
            <p
              className="font-medium"
              style={{ color: 'var(--accent-green, #34d399)' }}
            >
              You&apos;re on the list. We&apos;ll be in touch.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 rounded-lg px-4 py-3 text-sm font-mono outline-none"
              style={{
                backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
                border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              className="rounded-lg px-6 py-3 text-sm font-bold cursor-pointer transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(135deg, #9382ff, #34d399)',
                color: '#000',
              }}
            >
              Join Waitlist
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
