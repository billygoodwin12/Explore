'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Direction, Venue } from '@/lib/venues/types';
import DirectionBadge from './DirectionBadge';

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
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.30)' }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-xl p-6"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
            }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <h2 className="text-lg font-semibold mb-4" style={{ color: '#1a1a1a' }}>
              Confirm Investment
            </h2>

            <div className="space-y-3 mb-6">
              <DetailRow label="Investment" value={trade.name} />
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#666666' }}>Direction</span>
                <DirectionBadge direction={trade.direction} />
              </div>
              <DetailRow label="Amount" value={`$${trade.sizeUsdc.toLocaleString()}`} />
              {trade.leverage > 1 && (
                <DetailRow label="Multiplier" value={`${trade.leverage}x`} />
              )}
              <DetailRow
                label="Est. Price"
                value={`$${trade.estimatedPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}`}
              />
              <div className="border-t pt-3" style={{ borderColor: 'rgba(0, 0, 0, 0.06)' }}>
                <DetailRow label="Est. Fee" value={`$${trade.estimatedFee.toFixed(2)}`} dimValue />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: '#F3F3EE',
                  color: '#666666',
                }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                style={{
                  backgroundColor: '#6B5CE7',
                  color: '#FFFFFF',
                }}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DetailRow({ label, value, dimValue = false }: { label: string; value: string; dimValue?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: '#666666' }}>{label}</span>
      <span className="text-sm font-mono font-medium" style={{ color: dimValue ? '#999999' : '#1a1a1a' }}>
        {value}
      </span>
    </div>
  );
}
