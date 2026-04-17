import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createHash } from "crypto";
import { getEnv } from "../config/index.js";
import { getDb } from "../persist/db.js";
import { llmCalls } from "../persist/schema.js";
import { logger } from "../logger.js";
import type { NewsItem } from "./asknews.js";

const classificationSchema = z.object({
  affected_slugs: z.array(z.string()),
  direction: z.enum(["YES", "NO", "UNCLEAR"]),
  severity: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});

export type NewsClassification = z.infer<typeof classificationSchema>;

let client: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (client) return client;
  const env = getEnv();
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are a news classifier for a prediction market making bot on Polymarket. Your job is to determine if a news item affects any of the active prediction markets.

You MUST respond with valid JSON matching this schema:
{
  "affected_slugs": string[],   // slugs of affected markets
  "direction": "YES" | "NO" | "UNCLEAR",  // likely direction of price movement
  "severity": "low" | "medium" | "high",  // how urgently should we withdraw quotes
  "rationale": string           // brief explanation
}

Severity guide:
- "low": tangentially related, unlikely to move prices significantly
- "medium": directly related, could move prices 5-15% — withdraw quotes as precaution
- "high": breaking event that will definitely resolve or significantly move a market — withdraw immediately

CRITICAL: Err on the side of higher severity. False positives (unnecessary quote withdrawal) cost us a few minutes of rewards. False negatives (getting picked off) cost us real money.

Only output the JSON object, nothing else.`;

export async function classifyNews(
  news: NewsItem,
  activeSlugs: string[],
): Promise<NewsClassification> {
  const anthropic = getAnthropicClient();
  const start = Date.now();

  const userPrompt = `Active markets (slugs): ${JSON.stringify(activeSlugs)}

News item:
Headline: ${news.headline}
Summary: ${news.summary}
Source: ${news.source}
Published: ${news.publishedAt}
Categories: ${news.categories.join(", ")}`;

  const promptHash = createHash("sha256")
    .update(userPrompt)
    .digest("hex")
    .slice(0, 16);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const latencyMs = Date.now() - start;
  const rawOutput =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: NewsClassification;
  try {
    const json = JSON.parse(rawOutput);
    parsed = classificationSchema.parse(json);
  } catch (err) {
    logger.error(
      { err, rawOutput, newsId: news.id },
      "LLM output failed schema validation",
    );
    parsed = {
      affected_slugs: [],
      direction: "UNCLEAR",
      severity: "medium",
      rationale: `Schema validation failed: ${rawOutput}`,
    };
  }

  try {
    const db = getDb();
    await db.insert(llmCalls).values({
      model: "claude-haiku-4-5-20251001",
      promptHash,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      output: parsed,
      cost:
        (response.usage.input_tokens * 0.25 +
          response.usage.output_tokens * 1.25) /
        1_000_000,
      latencyMs,
      timestamp: BigInt(Date.now()),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to log LLM call");
  }

  logger.info(
    {
      newsId: news.id,
      severity: parsed.severity,
      affected: parsed.affected_slugs,
      latencyMs,
    },
    "News classified",
  );

  return parsed;
}
