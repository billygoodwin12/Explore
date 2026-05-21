"use client";

import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const REDIRECT_MS = 4000;

export function SuccessCard({ username }: { username: string }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(REDIRECT_MS / 1000),
  );

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((REDIRECT_MS - (Date.now() - start)) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(tick);
    }, 200);
    const t = setTimeout(() => router.push("/manage"), REDIRECT_MS);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [router]);

  return (
    <div className="text-center space-y-5 py-4">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-positive/10">
        <CheckCircle2
          className="size-7 text-positive"
          strokeWidth={1.75}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-heading-lg">Vault deployed</h2>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          <span className="num text-ink">@{username}</span> is live on
          Hyperliquid. Depositors can find you at{" "}
          <span className="num text-ink">theorise.app/{username}</span>.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button asChild variant="primary" size="default">
          <Link href={`/${username}`}>
            View your vault
            <ExternalLink />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="default">
          <Link href="/manage">Go to dashboard</Link>
        </Button>
      </div>
      <p className="text-[11px] text-ink-3 num">
        Redirecting to /manage in {secondsLeft}s
      </p>
    </div>
  );
}
