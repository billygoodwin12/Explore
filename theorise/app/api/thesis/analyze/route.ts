import { NextRequest, NextResponse } from 'next/server';
import { analyzeThesis, ConversationMessage } from '@/lib/ai/analyze';
import { enrichRecommendations } from '@/lib/ai/enrich';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history } = body as {
      message?: string;
      history?: ConversationMessage[];
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty "message" field in request body' },
        { status: 400 },
      );
    }

    const result = await analyzeThesis(message, history || []);

    // Conversational response — no trade recommendations
    if (result.mode === 'conversation') {
      return NextResponse.json({
        mode: 'conversation',
        content: result.content,
        rawJson: result.rawJson,
      });
    }

    // Trade response — enrich recommendations with market data
    const enrichedRecommendations = result.thesis
      ? await enrichRecommendations(result.thesis.recommendations)
      : [];

    return NextResponse.json({
      mode: 'trades',
      content: result.content,
      rawJson: result.rawJson,
      thesis_summary: result.thesis?.thesis_summary,
      causal_chain: result.thesis?.causal_chain,
      recommendations: enrichedRecommendations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const isClientError = message.includes('empty') || message.includes('missing');

    return NextResponse.json(
      { error: message },
      { status: isClientError ? 400 : 500 },
    );
  }
}
