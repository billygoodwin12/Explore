import { notFound } from "next/navigation";

import { CreatorProfile } from "@/components/creator/CreatorProfile";

type Params = { handle: string };

function normalize(raw: string): string {
  const decoded = decodeURIComponent(raw);
  return decoded.startsWith("@") ? decoded.slice(1) : decoded;
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { handle: raw } = await params;
  const handle = normalize(raw);

  if (handle.length === 0) {
    notFound();
  }

  return <CreatorProfile handle={handle} />;
}

export function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<{ title: string }> {
  return params.then(({ handle }) => ({
    title: `@${normalize(handle)} · Theorise`,
  }));
}
