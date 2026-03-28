// ---------------------------------------------------------------------------
// useThesisAnalysis – React Query hook for thesis analysis
// ---------------------------------------------------------------------------

import { useMutation } from '@tanstack/react-query';
import type { ThesisAnalysis } from '@/lib/venues/types';

async function analyzeThesis(input: string): Promise<ThesisAnalysis> {
  const res = await fetch('/api/thesis/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    throw new Error(`Analysis failed: ${res.status}`);
  }

  return res.json();
}

export function useThesisAnalysis() {
  const mutation = useMutation<ThesisAnalysis, Error, string>({
    mutationFn: analyzeThesis,
  });

  return {
    analyze: mutation.mutate,
    data: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}
