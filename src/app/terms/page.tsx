import { ContentPage, contentPageMetadata } from "@/components/marketing/content-page";

// Must stay a literal: Next.js statically analyses segment config.
export const revalidate = 300;

export const generateMetadata = () => contentPageMetadata("page-terms", "/terms");

export default function TermsPage() {
  return <ContentPage docKey="page-terms" />;
}
