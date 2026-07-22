// Always simulateContract before writeContract (spec 4.4), then wait for the receipt.
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Abi } from "viem";
import { explainError } from "./errors";

export interface TxResult {
  hash: `0x${string}`;
}

export async function runTx(
  config: Config,
  params: {
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    account: `0x${string}`;
  },
): Promise<TxResult> {
  try {
    const { request } = await simulateContract(config, params as never);
    const hash = await writeContract(config, request as never);
    const receipt = await waitForTransactionReceipt(config, { hash });
    if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
    return { hash };
  } catch (e) {
    throw new Error(explainError(e), { cause: e });
  }
}
