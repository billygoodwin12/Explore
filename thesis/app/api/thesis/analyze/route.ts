import { NextRequest, NextResponse } from 'next/server';
import { analyzeThesis } from '@/lib/ai/analyze';
import { enrichRecommendations } from '@/lib/ai/enrich';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input } = body as { input?: string };

    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty "input" field in request body' },
        { status: 400 }
      );
    }

    const analysis = await analyzeThesis(input);
    const enrichedRecommendations = await enrichRecommendations(analysis.recommendations);

    return NextResponse.json({
      thesis_summary: analysis.thesis_summary,
      causal_chain: analysis.causal_chain,
      recommendations: enrichedRecommendations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const isClientError = message.includes('empty') || message.includes('missing');

    return NextResponse.json(
      { error: message },
      { status: isClientError ? 400 : 500 }
    );
  }
}
