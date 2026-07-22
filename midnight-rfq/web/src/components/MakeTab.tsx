import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAccount, useConfig, useReadContracts, useSignTypedData } from "wagmi";
import { readContract } from "wagmi/actions";
import { offerStructToJson, type Address, type Hex, type OfferStruct } from "@shared/convert";
import { ADDRESSES, ERC20_ABI, HASH_HELPER_ABI, MIDNIGHT_ABI, ORACLE_ABI, RATIFIER_ABI, type MarketInfo } from "@shared/deployments";
import { CHAIN_ID } from "@shared/deployments";
import { assertDigestParity } from "@shared/digest";
import { offerTypedData, splitSignature } from "@shared/eip712";
import { cancelOffer, fetchOffers, postOffer } from "../lib/api";
import { aprFromPrice, countdown, formatApr, formatUnits, formatWad, parseAmount, priceFromApr, truncAddr } from "../lib/format";
import { buildOffer, collateralForDebt, marketStructOf, maxDebtOf } from "../lib/midnight";
import { runTx } from "../lib/tx";
import { useToast } from "../toast";

export function MakeTab({ market }: { market: MarketInfo }) {
  const { address } = useAccount();
  const config = useConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [direction, setDirection] = useState<"lend" | "borrow">("lend");
  const isLend = direction === "lend"; // lend = post BUY offer; borrow = post SELL offer
  const [sizeInput, setSizeInput] = useState("");
  const [aprInput, setAprInput] = useState("5.00");
  const defaultExpiry = () => {
    const d = new Date(Date.now() + 7 * 86400_000);
    return d.toISOString().slice(0, 16);
  };
  const [expiryInput, setExpiryInput] = useState(defaultExpiry);
  const [error, setError] = useState<string | null>(null);
  const [digestState, setDigestState] = useState<{ local: string; chain: string } | null>(null);
  const [pendingOffer, setPendingOffer] = useState<OfferStruct | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const size = parseAmount(sizeInput, market.loanDecimals) ?? 0n;
  const now = Math.floor(Date.now() / 1000);
  const ttm = Number(market.market.maturity) - now;
  const lltv = BigInt(market.market.collateralParams[0].lltv);

  // Tick pipeline (spec 4.5): APR -> price -> on-chain priceToTick -> canonical tickToPrice.
  const aprFloat = Number.parseFloat(aprInput) / 100;
  const targetPrice = Number.isFinite(aprFloat) && aprFloat >= 0 ? priceFromApr(aprFloat, ttm) : 0n;

  const { data: marketReadsData } = useReadContracts({
    contracts: [
      { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "tickSpacing", args: [market.id] },
      ...(address
        ? [
            { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "isAuthorized", args: [address, ADDRESSES.ratifier] },
            { address: market.market.loanToken as Address, abi: ERC20_ABI, functionName: "allowance", args: [address, ADDRESSES.midnight] },
            { address: market.market.loanToken as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [address] },
            { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "collateral", args: [market.id, address, 0n] },
            { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "debt", args: [market.id, address] },
            { address: market.oracle as Address, abi: ORACLE_ABI, functionName: "price", args: [] },
          ]
        : []),
    ] as never,
    query: { refetchInterval: 10_000 },
  });
  const marketReads = marketReadsData as { result?: unknown }[] | undefined;

  const tickSpacing = BigInt((marketReads?.[0]?.result as number | undefined) ?? 4);
  const ratifierAuthorized = (marketReads?.[1]?.result as boolean | undefined) ?? false;
  const loanAllowance = (marketReads?.[2]?.result as bigint | undefined) ?? 0n;
  const loanBalance = (marketReads?.[3]?.result as bigint | undefined) ?? 0n;
  const myCollateral = (marketReads?.[4]?.result as bigint | undefined) ?? 0n;
  const myDebt = (marketReads?.[5]?.result as bigint | undefined) ?? 0n;
  const oraclePrice = (marketReads?.[6]?.result as bigint | undefined) ?? 0n;

  // On-chain tick derivation (never reimplement tick math in TS).
  const { data: tickData } = useQuery({
    queryKey: ["tick", market.id, targetPrice.toString(), tickSpacing.toString()],
    enabled: targetPrice > 0n && targetPrice <= 10n ** 18n,
    queryFn: async () => {
      const tick = (await readContract(config, {
        address: ADDRESSES.hashHelper as Address,
        abi: HASH_HELPER_ABI as never,
        functionName: "priceToTick",
        args: [targetPrice, tickSpacing],
      })) as bigint;
      const canonicalPrice = (await readContract(config, {
        address: ADDRESSES.hashHelper as Address,
        abi: HASH_HELPER_ABI as never,
        functionName: "tickToPrice",
        args: [tick],
      })) as bigint;
      return { tick, canonicalPrice };
    },
  });

  const rateInvalid = !Number.isFinite(aprFloat) || aprFloat < 0 || targetPrice > 10n ** 18n || targetPrice <= 0n;
  const executableApr = tickData ? aprFromPrice(tickData.canonicalPrice, ttm) : null;

  // Checklist (spec 5.4).
  const collateralNeeded = isLend ? 0n : collateralForDebt(myDebt + size, oraclePrice, lltv, 125n);
  const collateralOk = isLend || maxDebtOf(myCollateral, oraclePrice, lltv) >= myDebt + size;
  const allowanceOk = !isLend || loanAllowance >= size;
  const balanceOk = !isLend || loanBalance >= size;

  async function fixAuthorize() {
    setBusy("auth");
    setError(null);
    try {
      await runTx(config, {
        address: ADDRESSES.midnight as Address,
        abi: MIDNIGHT_ABI as never,
        functionName: "setIsAuthorized",
        args: [ADDRESSES.ratifier, true, address],
        account: address as Address,
      });
      toast("Ratifier authorized on Midnight.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function fixApprove() {
    setBusy("approve");
    setError(null);
    try {
      await runTx(config, {
        address: market.market.loanToken as Address,
        abi: ERC20_ABI as never,
        functionName: "approve",
        args: [ADDRESSES.midnight, 2n ** 256n - 1n],
        account: address as Address,
      });
      toast(`${market.loanSymbol} approved.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function fixSupplyCollateral() {
    setBusy("collateral");
    setError(null);
    try {
      const missing = collateralNeeded > myCollateral ? collateralNeeded - myCollateral : 0n;
      await runTx(config, {
        address: market.market.collateralParams[0].token as Address,
        abi: ERC20_ABI as never,
        functionName: "approve",
        args: [ADDRESSES.midnight, 2n ** 256n - 1n],
        account: address as Address,
      });
      await runTx(config, {
        address: ADDRESSES.midnight as Address,
        abi: MIDNIGHT_ABI as never,
        functionName: "supplyCollateral",
        args: [marketStructOf(market), 0n, missing, address],
        account: address as Address,
      });
      toast("Collateral supplied.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyDigest(): Promise<{ offer: OfferStruct; digest: Hex } | null> {
    setError(null);
    setDigestState(null);
    if (!address || size === 0n || !tickData || rateInvalid) {
      setError("Fill in size and a valid rate first.");
      return null;
    }
    const expiryUnix = Math.floor(new Date(expiryInput).getTime() / 1000);
    if (!Number.isFinite(expiryUnix) || expiryUnix <= now) {
      setError("Expiry must be in the future.");
      return null;
    }
    const offer = buildOffer({
      info: market,
      buy: isLend,
      maker: address as Address,
      tick: tickData.tick,
      maxUnits: size,
      expiry: BigInt(expiryUnix),
      nowSeconds: now,
    });
    try {
      const digest = await assertDigestParity(offer, ADDRESSES.ratifier as Address, CHAIN_ID, async (o, r) =>
        (await readContract(config, {
          address: ADDRESSES.hashHelper as Address,
          abi: HASH_HELPER_ABI as never,
          functionName: "digestSingle",
          args: [o, r],
        })) as Hex,
      );
      setDigestState({ local: digest, chain: digest });
      setPendingOffer(offer);
      return { offer, digest };
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  async function signAndPost() {
    setBusy("sign");
    setError(null);
    try {
      const v = await verifyDigest(); // parity gate runs on EVERY signing path
      if (!v) return;
      const { offer, digest } = v;
      const typed = offerTypedData(offer, ADDRESSES.ratifier as Address, CHAIN_ID);
      const sig = await signTypedDataAsync(typed as never);
      const signature = splitSignature(sig);
      const root = (await readContract(config, {
        address: ADDRESSES.hashHelper as Address,
        abi: HASH_HELPER_ABI as never,
        functionName: "hashOffer",
        args: [offer],
      })) as string;
      const res = await postOffer({
        marketId: market.id,
        offer: offerStructToJson(offer),
        signature,
        root,
        digest,
      });
      toast(res.warning ? `Offer posted with warning: ${res.warning}` : "Offer posted to the book.");
      setPendingOffer(null);
      setDigestState(null);
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      queryClient.invalidateQueries({ queryKey: ["my-offers"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="row">
        <button className={isLend ? "primary" : ""} onClick={() => setDirection("lend")}>
          Lend (post buy offer)
        </button>
        <button className={!isLend ? "primary" : ""} onClick={() => setDirection("borrow")}>
          Borrow (post sell offer)
        </button>
      </div>

      <div className="mt">
        <label className="field">
          <span>Size ({market.loanSymbol})</span>
          <input value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} placeholder="10000" style={{ width: "100%" }} />
        </label>
        <label className="field">
          <span>Rate (APR %)</span>
          <input value={aprInput} onChange={(e) => setAprInput(e.target.value)} style={{ width: 140 }} />
        </label>
        {rateInvalid && aprInput !== "" && <div className="error-box">Rate must be a non-negative APR producing price ≤ 1.</div>}
        {tickData && executableApr !== null && !rateInvalid && (
          <div className="small-print mono">
            you quoted {formatApr(aprFloat)} → executable {formatApr(executableApr)} (tick {tickData.tick.toString()}, price{" "}
            {formatWad(tickData.canonicalPrice)})
          </div>
        )}
        <label className="field mt">
          <span>Expiry</span>
          <input type="datetime-local" value={expiryInput} onChange={(e) => setExpiryInput(e.target.value)} />
        </label>
      </div>

      <div className="section-title">Pre-sign checklist</div>
      <div className="check">
        <span className={`box ${ratifierAuthorized ? "ok" : ""}`}>[{ratifierAuthorized ? "✓" : " "}]</span>
        <span className="grow">Ratifier authorized on Midnight</span>
        {!ratifierAuthorized && (
          <button className="small" disabled={busy === "auth" || !address} onClick={fixAuthorize}>
            Authorize
          </button>
        )}
      </div>
      {isLend && (
        <>
          <div className="check">
            <span className={`box ${allowanceOk ? "ok" : ""}`}>[{allowanceOk ? "✓" : " "}]</span>
            <span className="grow">
              {market.loanSymbol} allowance to Midnight ≥ size (the taker's tx pulls your funds)
            </span>
            {!allowanceOk && (
              <button className="small" disabled={busy === "approve" || !address} onClick={fixApprove}>
                Approve
              </button>
            )}
          </div>
          <div className="check">
            <span className={`box ${balanceOk ? "ok" : ""}`}>[{balanceOk ? "✓" : " "}]</span>
            <span className="grow">
              {market.loanSymbol} balance ≥ size ({formatUnits(loanBalance, market.loanDecimals)} held)
            </span>
            {!balanceOk && <span className="small-print">→ Faucet tab</span>}
          </div>
        </>
      )}
      {!isLend && (
        <div className="check">
          <span className={`box ${collateralOk ? "ok" : ""}`}>[{collateralOk ? "✓" : " "}]</span>
          <span className="grow">
            Collateral covers size at oracle price (need ≈{formatUnits(collateralNeeded, market.collateralDecimals, 6)}{" "}
            {market.collateralSymbol}, have {formatUnits(myCollateral, market.collateralDecimals, 6)})
          </span>
          {!collateralOk && (
            <button className="small" disabled={busy === "collateral" || !address || size === 0n} onClick={fixSupplyCollateral}>
              Supply
            </button>
          )}
        </div>
      )}

      <div className="row mt">
        <button onClick={verifyDigest} disabled={!address || size === 0n || !tickData}>
          Verify digest
        </button>
        <button
          className="primary"
          onClick={signAndPost}
          disabled={!address || size === 0n || !tickData || busy === "sign" || !ratifierAuthorized}
        >
          Sign &amp; post
        </button>
      </div>

      {digestState && (
        <div className="mt">
          <div className="small-print">local (viem hashTypedData) — matches on-chain HashHelper.digestSingle:</div>
          <div className="hash-box credit">{digestState.local}</div>
        </div>
      )}
      {error && <div className="error-box">{error}</div>}

      <MyQuotes market={market} />
    </div>
  );
}

function MyQuotes({ market }: { market: MarketInfo }) {
  const { address } = useAccount();
  const config = useConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: offers } = useQuery({
    queryKey: ["my-offers", market.id, address],
    queryFn: () => fetchOffers(market.id, "open"),
    refetchInterval: 5000,
    enabled: !!address,
  });
  const mine = (offers ?? []).filter((o) => o.offer.maker.toLowerCase() === address?.toLowerCase());
  const now = Math.floor(Date.now() / 1000);
  const ttm = Number(market.market.maturity) - now;

  async function cancel(id: string, root: string) {
    setBusy(id);
    try {
      const { hash } = await runTx(config, {
        address: ADDRESSES.ratifier as Address,
        abi: RATIFIER_ABI as never,
        functionName: "cancelRoot",
        args: [address, root],
        account: address as Address,
      });
      await cancelOffer(id, hash);
      toast("Offer cancelled on-chain and delisted.");
      queryClient.invalidateQueries({ queryKey: ["my-offers"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  if (!address || mine.length === 0) return null;
  return (
    <>
      <div className="section-title">My quotes</div>
      <table>
        <thead>
          <tr>
            <th>Dir</th>
            <th>APR</th>
            <th>Size</th>
            <th>Expiry</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {mine.map((o) => (
            <tr key={o.id}>
              <td>{o.offer.buy ? "LEND" : "BORROW"}</td>
              <td className="apr">{formatApr(aprFromPrice(BigInt(o.priceWad), ttm))}</td>
              <td>
                {formatUnits(BigInt(o.offer.maxUnits), market.loanDecimals)} {market.loanSymbol}
              </td>
              <td className="small-print">{countdown(Number(o.offer.expiry))}</td>
              <td>
                <button className="small" disabled={busy === o.id} onClick={() => cancel(o.id, o.root)}>
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
