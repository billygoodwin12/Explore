import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    HL_RPC_URL: z.string().url().optional(),
    HYPERSCAN_BASE: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_CHAIN_ID: z.coerce.number().default(998),
    NEXT_PUBLIC_USE_MOCK_CONTRACTS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    NEXT_PUBLIC_USDC_ADDRESS: z
      .string()
      .default("0xb88339CB7199b77E23DB6E890353E22632Ba630f"),
  },
  runtimeEnv: {
    HL_RPC_URL: process.env.HL_RPC_URL,
    HYPERSCAN_BASE: process.env.HYPERSCAN_BASE,
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    NEXT_PUBLIC_USE_MOCK_CONTRACTS: process.env.NEXT_PUBLIC_USE_MOCK_CONTRACTS,
    NEXT_PUBLIC_USDC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ADDRESS,
  },
  emptyStringAsUndefined: true,
});
