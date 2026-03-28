import Anthropic from '@anthropic-ai/sdk';
import { THESIS_SYSTEM_PROMPT } from './thesis-prompt';
import { ThesisAnalysis } from '../venues/types';

const client = new Anthropic();

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnalysisResult {
  mode: 'conversation' | 'trades';
  content: string;
  thesis?: ThesisAnalysis;
}

export async function analyzeThesis(
  userInput: string,
  history: ConversationMessage[] = [],
): Promise<AnalysisResult> {
  if (!userInput || userInput.trim().length === 0) {
    throw new Error('Input cannot be empty');
  }

  // Build message history for multi-turn conversation
  const messages: Anthropic.MessageParam[] = [
    ...history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userInput.trim() },
  ];

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: THESIS_SYSTEM_PROMPT,
    messages,
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response received from Claude');
  }

  const rawText = textBlock.text.trim();

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // If JSON parsing fails, treat as conversational response
    return {
      mode: 'conversation',
      content: rawText,
    };
  }

  const mode = parsed.mode as string;

  // Conversational mode — just return the content
  if (mode === 'conversation' || !parsed.recommendations) {
    return {
      mode: 'conversation',
      content: (parsed.content as string) || rawText,
    };
  }

  // Trade mode — validate and return structured analysis
  const analysis: ThesisAnalysis = {
    thesis_summary: (parsed.thesis_summary as string) || '',
    causal_chain: (parsed.causal_chain as ThesisAnalysis['causal_chain']) || [],
    recommendations: (parsed.recommendations as ThesisAnalysis['recommendations']) || [],
  };

  if (!analysis.thesis_summary) {
    throw new Error('Response missing valid thesis_summary');
  }
  if (!Array.isArray(analysis.recommendations) || analysis.recommendations.length === 0) {
    throw new Error('Response missing valid recommendations array');
  }

  // Validate each recommendation
  for (const rec of analysis.recommendations) {
    if (!rec.venue || !rec.symbol || !rec.direction || rec.conviction == null) {
      throw new Error(
        `Invalid recommendation: missing required fields in ${JSON.stringify(rec)}`,
      );
    }
    rec.conviction = Math.max(0, Math.min(100, rec.conviction));
  }

  return {
    mode: 'trades',
    content: (parsed.content as string) || 'Here are my trade recommendations based on your thesis.',
    thesis: analysis,
  };
}
