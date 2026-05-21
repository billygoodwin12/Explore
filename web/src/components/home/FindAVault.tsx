"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchCreators } from "@/lib/hooks/useSearchCreators";
import { shortenAddress } from "@/lib/formatting/address";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function FindAVault() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const { data: all = [] } = useSearchCreators({ limit: 1000 });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;

    if (ADDRESS_RE.test(v)) {
      const needle = v.toLowerCase();
      const match = all.find(
        (c) =>
          c.id.toLowerCase() === needle ||
          c.creatorAddress.toLowerCase() === needle,
      );
      if (match) {
        router.push(`/${match.handle}`);
        return;
      }
      toast.error(`No vault found at ${shortenAddress(v)}`, {
        description: "Double-check the address or try a @handle.",
      });
      return;
    }

    const handle = v.startsWith("@") ? v.slice(1) : v;
    if (handle.length === 0) return;
    router.push(`/${handle}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="@handle or 0x…"
        autoComplete="off"
        spellCheck={false}
        className="font-mono text-[14px] flex-1"
      />
      <Button type="submit" variant="primary" size="default" disabled={!value.trim()}>
        Find vault
      </Button>
    </form>
  );
}
