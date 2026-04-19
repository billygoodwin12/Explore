import { NextResponse } from 'next/server';
import { z } from 'zod';

const VaultPositionSchema = z.object({
  sym: z.string(),
  name: z.string(),
  dir: z.enum(['long', 'short']),
  lev: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
  alloc: z.number().min(5).max(95),
});

/**
 * Post-deploy metadata sink. The vault itself is deployed on-chain by the wizard
 * via useCreateVault → VaultFactory.createVault. This endpoint only captures the
 * off-chain display bits (name, desc, fees) keyed by the already-deployed address.
 */
const VaultMetadataSchema = z.object({
  vaultAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  name: z.string().min(1).max(60),
  desc: z.string().max(2000).optional().default(''),
  positions: z.array(VaultPositionSchema).min(1).max(10),
  deployIM: z.number().min(1),
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
    const parsed = VaultMetadataSchema.parse(body);

    const allocTotal = parsed.positions.reduce((a, p) => a + p.alloc, 0);
    if (allocTotal !== 100) {
      return NextResponse.json(
        { error: `Allocation must sum to 100%, got ${allocTotal}%` },
        { status: 400 },
      );
    }

    // TODO(persistence): write to KV/Postgres keyed by vaultAddress.
    // Currently a no-op — on-chain state is the source of truth for shares/IM,
    // this only hides creator-facing display bits behind an address lookup.
    console.log('[vaults/create] metadata', {
      vaultAddress: parsed.vaultAddress,
      txHash: parsed.txHash,
      name: parsed.name,
      creator: parsed.creatorAddress,
    });

    const positionSummary = parsed.positions
      .map(p => `${p.sym} ${p.dir === 'long' ? 'Long' : 'Short'} ${p.lev}x (${p.alloc}%)`)
      .join(' / ');

    const xShareText = [
      `\uD83D\uDCE6 ${parsed.name}`,
      positionSummary,
      `${parsed.timeframe} \u00B7 ${parsed.perfFee}% perf fee`,
      `theorise.xyz/vaults/${parsed.vaultAddress}`,
    ].join('\n');

    return NextResponse.json({
      ok: true,
      vaultAddress: parsed.vaultAddress,
      vaultUrl: `theorise.xyz/vaults/${parsed.vaultAddress}`,
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
