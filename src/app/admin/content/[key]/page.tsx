import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getDocumentDef } from "@/lib/cms/schema";
import { getEditorState, listVersions } from "@/lib/cms/content-server";
import { ContentEditor } from "../editor";

export const metadata: Metadata = { title: "ویرایش محتوا" };
export const dynamic = "force-dynamic";

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await requirePageAdmin();
  const { key } = await params;
  const def = getDocumentDef(key);
  if (!def) notFound();

  const [state, versions] = await Promise.all([getEditorState(key), listVersions(key)]);
  return <ContentEditor def={def} initial={state} initialVersions={versions} />;
}
