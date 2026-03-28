// ---------------------------------------------------------------------------
// useTradeExecution – hook for executing trades via the orders API
// ---------------------------------------------------------------------------

import { useMutation } from '@tanstack/react-query';
import type { TradeOrder, TradeResult } from '@/lib/venues/types';

async function executeOrder(order: TradeOrder): Promise<TradeResult> {
  const res = await fetch('/api/orders/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  if (!res.ok) {
    throw new Error(`Order execution failed: ${res.status}`);
  }

  return res.json();
}

export function useTradeExecution() {
  const mutation = useMutation<TradeResult, Error, TradeOrder>({
    mutationFn: executeOrder,
  });

  return {
    execute: mutation.mutate,
    isExecuting: mutation.isPending,
    lastResult: mutation.data ?? null,
    error: mutation.error,
  };
}
