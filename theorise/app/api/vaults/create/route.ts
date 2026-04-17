import { NextResponse } from 'next/server';
import { z } from 'zod';

const VaultPositionSchema = z.object({
  sym: z.string(),
  name: z.string(),
  dir: z.enum(['long', 'short']),
  lev: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
  alloc: z.number().min(5).max(95),
});

const CreateVaultSchema = z.object({
  name: z.string().min(1).max(60),
  desc: z.string().max(2000).optional().default(''),
  positions: z.array(VaultPositionSchema).min(1).max(10),
  deploySize: z.number().min(10),
  timeframe: z.enum(['1h', '4h', '1d', '3d', '7d', '2w', '1m', '3m']),
  settlementMode: z.enum(['HARD', 'SOFT', 'CREATOR']),
  perfFee: z.number().min(0).max(30),
  exitFee: z.number().min(0).max(5),
  minDeposit: z.number().min(0),
  creatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateVaultSchema.parse(body);

    const allocTotal = parsed.positions.reduce((a, p) => a + p.alloc, 0);
    if (allocTotal !== 100) {
      return NextResponse.json(
        { error: `Allocation must sum to 100%, got ${allocTotal}%` },
        { status: 400 },
      );
    }

    // Stub: generate a mock vault address
    // Real contract deployment wired in Step 10
    const mockAddr = '0x' + Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');

    const positionSummary = parsed.positions
      .map(p => `${p.sym} ${p.dir === 'long' ? 'Long' : 'Short'} ${p.lev}x (${p.alloc}%)`)
      .join(' / ');

    const xShareText = [
      `\uD83D\uDCE6 ${parsed.name}`,
      positionSummary,
      `${parsed.timeframe} \u00B7 ${parsed.perfFee}% perf fee`,
      `theorise.xyz/vaults/${mockAddr}`,
    ].join('\n');

    return NextResponse.json({
      vaultAddress: mockAddr,
      txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      vaultUrl: `theorise.xyz/vaults/${mockAddr}`,
      xShareText,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues.map((iss: z.ZodIssue) => `${iss.path.join('.')}: ${iss.message}`).join('; ') },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 },
    );
  }
}
