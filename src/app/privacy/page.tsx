import { ContentPage, contentPageMetadata } from "@/components/marketing/content-page";

// Must stay a literal: Next.js statically analyses segment config.
export const revalidate = 300;

export const generateMetadata = () => contentPageMetadata("page-privacy", "/privacy");

export default function PrivacyPage() {
  return <ContentPage docKey="page-privacy" />;
}
