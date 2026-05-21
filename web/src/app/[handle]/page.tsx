import { notFound } from "next/navigation";

import { CreatorStub } from "@/components/creator/CreatorStub";

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

  return <CreatorStub handle={handle} />;
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
