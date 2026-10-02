import type { Metadata } from "next";
import { requirePageAdmin } from "@/lib/auth/guards";
import { getDocumentDef } from "@/lib/cms/schema";
import { getEditorState, listVersions } from "@/lib/cms/content-server";
import { ContentEditor } from "../content/editor";

export const metadata: Metadata = { title: "تنظیمات سایت" };
export const dynamic = "force-dynamic";

/**
 * Contact details, social links, search-engine text, the trust seal, the
 * trial length and the announcement bar. The same editor as the pages, with
 * the same draft → preview → publish steps and history.
 */
export default async function SiteSettingsPage() {
  await requirePageAdmin();
  const def = getDocumentDef("site")!;
  const [state, versions] = await Promise.all([
    getEditorState("site"),
    listVersions("site"),
  ]);
  return <ContentEditor def={def} initial={state} initialVersions={versions} />;
}
