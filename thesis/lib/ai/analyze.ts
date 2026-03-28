import Anthropic from '@anthropic-ai/sdk';
import { THESIS_SYSTEM_PROMPT } from './thesis-prompt';
import { ThesisAnalysis } from '../venues/types';

const client = new Anthropic();

export async function analyzeThesis(userInput: string): Promise<ThesisAnalysis> {
  if (!userInput || userInput.trim().length === 0) {
    throw new Error('Thesis input cannot be empty');
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: THESIS_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userInput.trim(),
      },
    ],
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw response: ${rawText.slice(0, 500)}`
    );
  }

  const analysis = parsed as ThesisAnalysis;

  // Validate required fields
  if (!analysis.thesis_summary || typeof analysis.thesis_summary !== 'string') {
    throw new Error('Response missing valid thesis_summary');
  }
  if (!Array.isArray(analysis.causal_chain)) {
    throw new Error('Response missing valid causal_chain array');
  }
  if (!Array.isArray(analysis.recommendations) || analysis.recommendations.length === 0) {
    throw new Error('Response missing valid recommendations array');
  }

  // Validate each recommendation
  for (const rec of analysis.recommendations) {
    if (!rec.venue || !rec.symbol || !rec.direction || rec.conviction == null) {
      throw new Error(
        `Invalid recommendation: missing required fields in ${JSON.stringify(rec)}`
      );
    }
    rec.conviction = Math.max(0, Math.min(100, rec.conviction));
  }

  return analysis;
}
