import { notFound } from "next/navigation";

import { CreatorStub } from "@/components/creator/CreatorStub";

type Params = { handle: string };

export default async function CreatorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { handle: raw } = await params;
  const decoded = decodeURIComponent(raw);

  if (!decoded.startsWith("@")) {
    notFound();
  }

  const handle = decoded.slice(1);
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
  return params.then(({ handle }) => {
    const decoded = decodeURIComponent(handle);
    const cleaned = decoded.startsWith("@") ? decoded.slice(1) : decoded;
    return { title: `@${cleaned} · Theorise` };
  });
}
