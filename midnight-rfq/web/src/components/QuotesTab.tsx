import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAccount, useConfig, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";
import { offerJsonToStruct, type Address } from "@shared/convert";
import { ADDRESSES, ERC20_ABI, MIDNIGHT_ABI, ORACLE_ABI, type MarketInfo } from "@shared/deployments";
import { encodeRatifierData } from "@shared/eip712";
import { fetchOffers, type ListedOffer } from "../lib/api";
import { aprFromPrice, countdown, formatApr, formatUnits, formatWad, parseAmount, truncAddr } from "../lib/format";
import { ZERO_ADDRESS, assetsForUnits, collateralForDebt, marketStructOf, maxDebtOf } from "../lib/midnight";
import { runTx } from "../lib/tx";
import { EXPLORER } from "../wagmi";
import { useToast } from "../toast";

interface EnrichedOffer extends ListedOffer {
  remaining: bigint;
  apr: number;
  makerUnderfunded: boolean;
  makerUnauthorized: boolean;
}

export function QuotesTab({ market }: { market: MarketInfo }) {
  const { data: offers } = useQuery({
    queryKey: ["offers", market.id],
    queryFn: () => fetchOffers(market.id),
    refetchInterval: 5000,
  });

  const open = useMemo(() => (offers ?? []).filter((o) => o.status === "open"), [offers]);

  // Live enrichment reads: consumed, maker auth, and for buy offers maker balance+allowance.
  const contracts = useMemo(
    () =>
      open.flatMap((o) => [
        {
          address: ADDRESSES.midnight as Address,
          abi: MIDNIGHT_ABI,
          functionName: "consumed",
          args: [o.offer.maker, o.offer.group],
        },
        {
          address: ADDRESSES.midnight as Address,
          abi: MIDNIGHT_ABI,
          functionName: "isAuthorized",
          args: [o.offer.maker, ADDRESSES.ratifier],
        },
        {
          address: market.market.loanToken as Address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [o.offer.maker],
        },
        {
          address: market.market.loanToken as Address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [o.offer.maker, ADDRESSES.midnight],
        },
      ]),
    [open, market],
  );

  const { data: readsData } = useReadContracts({
    contracts: contracts as never,
    query: { enabled: open.length > 0, refetchInterval: 10_000 },
  });
  const reads = readsData as { result?: unknown }[] | undefined;

  const now = Math.floor(Date.now() / 1000);
  const ttm = Number(market.market.maturity) - now;

  const enriched: EnrichedOffer[] = useMemo(
    () =>
      open.map((o, i) => {
        const consumed = (reads?.[i * 4]?.result as bigint | undefined) ?? 0n;
        const authorized = (reads?.[i * 4 + 1]?.result as boolean | undefined) ?? o.makerAuthorized ?? false;
        const makerBalance = (reads?.[i * 4 + 2]?.result as bigint | undefined) ?? 0n;
        const makerAllowance = (reads?.[i * 4 + 3]?.result as bigint | undefined) ?? 0n;
        const remaining = BigInt(o.offer.maxUnits) - consumed;
        const remainingAssets = assetsForUnits(remaining, BigInt(o.priceWad), o.offer.buy);
        const makerUnderfunded = o.offer.buy && (makerBalance < remainingAssets || makerAllowance < remainingAssets);
        return {
          ...o,
          remaining: remaining > 0n ? remaining : 0n,
          apr: aprFromPrice(BigInt(o.priceWad), ttm),
          makerUnderfunded,
          makerUnauthorized: !authorized,
        };
      }),
    [open, reads, ttm],
  );

  const lendQuotes = enriched.filter((o) => o.offer.buy);
  const borrowRequests = enriched.filter((o) => !o.offer.buy);
  const [taking, setTaking] = useState<EnrichedOffer | null>(null);

  return (
    <div>
      <div className="section-title">Lend quotes — take to borrow</div>
      <OfferTable offers={lendQuotes} market={market} onTake={setTaking} emptyText="No open offers. Post the first quote." />
      <div className="section-title">Borrow requests — take to lend</div>
      <OfferTable offers={borrowRequests} market={market} onTake={setTaking} emptyText="No borrow requests resting." />
      {taking && <TakeModal offer={taking} market={market} onClose={() => setTaking(null)} />}
    </div>
  );
}

function OfferTable(props: {
  offers: EnrichedOffer[];
  market: MarketInfo;
  onTake: (o: EnrichedOffer) => void;
  emptyText: string;
}) {
  const { offers, market } = props;
  if (offers.length === 0) return <div className="empty">{props.emptyText}</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Implied APR</th>
          <th>Size remaining</th>
          <th>Price</th>
          <th>Tick</th>
          <th>Maker</th>
          <th>Expiry</th>
          <th>Flags</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {offers.map((o) => {
          const flags: string[] = [];
          if (o.makerUnauthorized) flags.push("maker unauthorized");
          if (o.expired) flags.push("expired");
          if (o.makerUnderfunded) flags.push("maker underfunded");
          const takeable = !o.expired && !o.makerUnauthorized && o.remaining > 0n;
          return (
            <tr key={o.id}>
              <td className="apr">{formatApr(o.apr)}</td>
              <td>
                {formatUnits(o.remaining, market.loanDecimals)} <span className="dim">{market.loanSymbol}</span>
              </td>
              <td className="small-print">{formatWad(BigInt(o.priceWad))}</td>
              <td className="small-print">{o.offer.tick}</td>
              <td className="addr" title={o.offer.maker}>
                {truncAddr(o.offer.maker)}
              </td>
              <td className="small-print">{countdown(Number(o.offer.expiry))}</td>
              <td className="small-print" style={{ color: flags.length ? "var(--red)" : undefined }}>
                {flags.join(" · ") || "—"}
              </td>
              <td>
                <button className="primary small" disabled={!takeable} onClick={() => props.onTake(o)}>
                  Take
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type StepState = "idle" | "pending" | "done" | "error";

function TakeModal(props: { offer: EnrichedOffer; market: MarketInfo; onClose: () => void }) {
  const { offer, market } = props;
  const { address } = useAccount();
  const config = useConfig();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isBuy = offer.offer.buy; // taker borrows on buy offers, lends on sell offers

  const [unitsInput, setUnitsInput] = useState("");
  const [collateralInput, setCollateralInput] = useState("");
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [error, setError] = useState<string | null>(null);
  const [txLinks, setTxLinks] = useState<Record<string, string>>({});

  const units = parseAmount(unitsInput, market.loanDecimals) ?? 0n;
  const priceWad = BigInt(offer.priceWad);
  const buyerAssets = assetsForUnits(units, priceWad, isBuy);
  const lltv = BigInt(market.market.collateralParams[0].lltv);

  // Position reads for preview.
  const { data: posReadsData } = useReadContracts({
    contracts: (address
      ? [
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "debt", args: [market.id, address] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "collateral", args: [market.id, address, 0n] },
          { address: market.oracle as Address, abi: ORACLE_ABI, functionName: "price", args: [] },
          { address: ADDRESSES.midnight as Address, abi: MIDNIGHT_ABI, functionName: "credit", args: [market.id, address] },
        ]
      : []) as never,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const posReads = posReadsData as { result?: unknown }[] | undefined;
  const myDebt = (posReads?.[0]?.result as bigint | undefined) ?? 0n;
  const myCollateral = (posReads?.[1]?.result as bigint | undefined) ?? 0n;
  const oraclePrice = (posReads?.[2]?.result as bigint | undefined) ?? 0n;
  const myCredit = (posReads?.[3]?.result as bigint | undefined) ?? 0n;

  // Default collateral to post: HF 1.25 on (debt + units), minus already-posted.
  const defaultCollateral = useMemo(() => {
    if (!isBuy || oraclePrice === 0n) return 0n;
    const needed = collateralForDebt(myDebt + units, oraclePrice, lltv, 125n);
    return needed > myCollateral ? needed - myCollateral : 0n;
  }, [isBuy, myDebt, units, oraclePrice, lltv, myCollateral]);

  const collateralToPost =
    collateralInput === "" ? defaultCollateral : (parseAmount(collateralInput, market.collateralDecimals) ?? 0n);

  const postTradeMaxDebt = maxDebtOf(myCollateral + (isBuy ? collateralToPost : 0n), oraclePrice, lltv);
  const postTradeDebt = isBuy ? myDebt + units : myDebt;
  const healthy = postTradeMaxDebt >= postTradeDebt;

  async function run(step: string, fn: () => Promise<{ hash: string } | void>) {
    setError(null);
    setSteps((s) => ({ ...s, [step]: "pending" }));
    try {
      const r = await fn();
      if (r?.hash) setTxLinks((t) => ({ ...t, [step]: `${EXPLORER}/tx/${r.hash}` }));
      setSteps((s) => ({ ...s, [step]: "done" }));
    } catch (e) {
      setSteps((s) => ({ ...s, [step]: "error" }));
      setError((e as Error).message);
      throw e;
    }
  }

  const me = address as Address;

  async function doApproveCollateral() {
    await run("approve", () =>
      runTx(config, {
        address: market.market.collateralParams[0].token as Address,
        abi: ERC20_ABI as never,
        functionName: "approve",
        args: [ADDRESSES.midnight, 2n ** 256n - 1n],
        account: me,
      }),
    );
  }

  async function doSupplyCollateral() {
    await run("supply", () =>
      runTx(config, {
        address: ADDRESSES.midnight as Address,
        abi: MIDNIGHT_ABI as never,
        functionName: "supplyCollateral",
        args: [marketStructOf(market), 0n, collateralToPost, me],
        account: me,
      }),
    );
  }

  async function doApproveLoan() {
    await run("approveLoan", () =>
      runTx(config, {
        address: market.market.loanToken as Address,
        abi: ERC20_ABI as never,
        functionName: "approve",
        args: [ADDRESSES.midnight, 2n ** 256n - 1n], // max for demo friction reduction
        account: me,
      }),
    );
  }

  async function doTake() {
    // Live remaining capacity check before firing.
    const consumed = (await readContract(config, {
      address: ADDRESSES.midnight as Address,
      abi: MIDNIGHT_ABI as never,
      functionName: "consumed",
      args: [offer.offer.maker, offer.offer.group],
    })) as bigint;
    const remaining = BigInt(offer.offer.maxUnits) - consumed;
    if (units > remaining) throw new Error(`fill exceeds remaining capacity (${remaining} units left)`);

    const struct = offerJsonToStruct(offer.offer);
    const ratifierData = encodeRatifierData(offer.signature as never, offer.root as `0x${string}`);
    await run("take", () =>
      runTx(config, {
        address: ADDRESSES.midnight as Address,
        abi: MIDNIGHT_ABI as never,
        functionName: "take",
        args: [struct, ratifierData, units, me, isBuy ? me : ZERO_ADDRESS, ZERO_ADDRESS, "0x"],
        account: me,
      }),
    );
    toast(
      `Filled ${formatUnits(units, market.loanDecimals)} units at ${formatWad(priceWad)} — ${
        isBuy ? "you received" : "you paid"
      } ${formatUnits(buyerAssets, market.loanDecimals)} ${market.loanSymbol}`,
    );
    queryClient.invalidateQueries({ queryKey: ["offers"] });
  }

  const stepIcon = (s: StepState | undefined) => (s === "done" ? "✓" : s === "pending" ? "…" : s === "error" ? "✗" : "·");

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          TAKE {isBuy ? "LEND QUOTE (you borrow)" : "BORROW REQUEST (you lend)"} ·{" "}
          <span className="apr">{formatApr(offer.apr)}</span>
        </h3>

        <label className="field">
          <span>
            Units to fill (max {formatUnits(offer.remaining, market.loanDecimals)} {market.loanSymbol})
          </span>
          <input value={unitsInput} onChange={(e) => setUnitsInput(e.target.value)} placeholder="0.00" style={{ width: "100%" }} />
        </label>

        {units > 0n && (
          <div className="facts" style={{ borderTop: "none", paddingTop: 0 }}>
            <dl>
              <dt>{isBuy ? "You receive now" : "You pay now"}</dt>
              <dd className={isBuy ? "credit" : "debit"}>
                {formatUnits(buyerAssets, market.loanDecimals)} {market.loanSymbol}
              </dd>
              <dt>{isBuy ? "You owe at maturity" : "You are owed at maturity"}</dt>
              <dd className={isBuy ? "debit" : "credit"}>
                {formatUnits(units, market.loanDecimals)} {market.loanSymbol}
              </dd>
              <dt>Price / tick</dt>
              <dd>
                {formatWad(priceWad)} / {offer.offer.tick}
              </dd>
              {isBuy && (
                <>
                  <dt>Post-trade debt</dt>
                  <dd>{formatUnits(postTradeDebt, market.loanDecimals)}</dd>
                  <dt>Post-trade max debt</dt>
                  <dd className={healthy ? "credit" : "debit"}>{formatUnits(postTradeMaxDebt, market.loanDecimals)}</dd>
                </>
              )}
              {!isBuy && myCredit > 0n && (
                <>
                  <dt>Existing credit</dt>
                  <dd>{formatUnits(myCredit, market.loanDecimals)}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {isBuy && (
          <label className="field mt">
            <span>
              Collateral to post ({market.collateralSymbol}; default targets health factor 1.25)
            </span>
            <input
              value={collateralInput}
              onChange={(e) => setCollateralInput(e.target.value)}
              placeholder={formatUnits(defaultCollateral, market.collateralDecimals, market.collateralDecimals > 8 ? 6 : 4)}
              style={{ width: "100%" }}
            />
          </label>
        )}

        <div className="mt">
          {isBuy ? (
            <>
              <div className="step">
                <span className="status">{stepIcon(steps.approve)}</span>
                <span className="grow">1. Approve {market.collateralSymbol}</span>
                {txLinks.approve && <a href={txLinks.approve} target="_blank" rel="noreferrer">tx ↗</a>}
                <button className="small" disabled={steps.approve === "pending"} onClick={doApproveCollateral}>
                  Approve
                </button>
              </div>
              <div className="step">
                <span className="status">{stepIcon(steps.supply)}</span>
                <span className="grow">
                  2. Supply {formatUnits(collateralToPost, market.collateralDecimals, 6)} {market.collateralSymbol}
                </span>
                {txLinks.supply && <a href={txLinks.supply} target="_blank" rel="noreferrer">tx ↗</a>}
                <button
                  className="small"
                  disabled={collateralToPost === 0n || steps.supply === "pending"}
                  onClick={doSupplyCollateral}
                >
                  Supply
                </button>
              </div>
              <div className="step">
                <span className="status">{stepIcon(steps.take)}</span>
                <span className="grow">3. Take</span>
                {txLinks.take && <a href={txLinks.take} target="_blank" rel="noreferrer">tx ↗</a>}
                <button className="primary small" disabled={units === 0n || steps.take === "pending"} onClick={doTake}>
                  Take
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="step">
                <span className="status">{stepIcon(steps.approveLoan)}</span>
                <span className="grow">1. Approve {market.loanSymbol} (max)</span>
                {txLinks.approveLoan && <a href={txLinks.approveLoan} target="_blank" rel="noreferrer">tx ↗</a>}
                <button className="small" disabled={steps.approveLoan === "pending"} onClick={doApproveLoan}>
                  Approve
                </button>
              </div>
              <div className="step">
                <span className="status">{stepIcon(steps.take)}</span>
                <span className="grow">2. Take</span>
                {txLinks.take && <a href={txLinks.take} target="_blank" rel="noreferrer">tx ↗</a>}
                <button className="primary small" disabled={units === 0n || steps.take === "pending"} onClick={doTake}>
                  Take
                </button>
              </div>
            </>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="row spread mt">
          <span className="small-print">
            {isBuy
              ? "The maker's funds move to you inside your take transaction."
              : "You pay the maker directly inside your take transaction."}
          </span>
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
