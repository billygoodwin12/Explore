'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Direction, Venue } from '@/lib/venues/types';
import DirectionBadge from './DirectionBadge';
import GlowButton from '@/components/ui/GlowButton';

interface OrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  trade: {
    venue: Venue;
    symbol: string;
    name: string;
    direction: Direction;
    sizeUsdc: number;
    leverage: number;
    estimatedPrice: number;
    estimatedFee: number;
  } | null;
}

export default function OrderConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  trade,
}: OrderConfirmModalProps) {
  if (!trade) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Overlay */}
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.70)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary, #0f0f17)',
              border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <h2
              className="text-lg font-bold mb-4"
              style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
            >
              Confirm Order
            </h2>

            {/* Details */}
            <div className="space-y-3 mb-6">
              <DetailRow label="Instrument" value={trade.name} />
              <div className="flex items-center justify-between">
                <span
                  className="text-sm"
                  style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
                >
                  Direction
                </span>
                <DirectionBadge direction={trade.direction} />
              </div>
              <DetailRow
                label="Size"
                value={`$${trade.sizeUsdc.toLocaleString()} USDC`}
              />
              <DetailRow label="Leverage" value={`${trade.leverage}x`} />
              <DetailRow
                label="Est. Price"
                value={`$${trade.estimatedPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}`}
              />
              <div
                className="border-t pt-3"
                style={{
                  borderColor: 'var(--border-subtle, rgba(255,255,255,0.04))',
                }}
              >
                <DetailRow
                  label="Est. Fee"
                  value={`$${trade.estimatedFee.toFixed(2)}`}
                  dimValue
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-lg text-sm font-bold transition-colors"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
                  color: 'var(--text-secondary, rgba(255,255,255,0.55))',
                }}
              >
                Cancel
              </button>
              <div className="flex-1">
                <GlowButton
                  variant="green"
                  onClick={onConfirm}
                  className="w-full py-3 text-sm"
                >
                  Confirm Trade
                </GlowButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DetailRow({
  label,
  value,
  dimValue = false,
}: {
  label: string;
  value: string;
  dimValue?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-sm"
        style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}
      >
        {label}
      </span>
      <span
        className="text-sm font-mono font-medium"
        style={{
          color: dimValue
            ? 'var(--text-tertiary, rgba(255,255,255,0.30))'
            : 'var(--text-primary, rgba(255,255,255,0.92))',
        }}
      >
        {value}
      </span>
    </div>
  );
}
