import { ContentPage, contentPageMetadata } from "@/components/marketing/content-page";

// Must stay a literal: Next.js statically analyses segment config.
export const revalidate = 300;

export const generateMetadata = () => contentPageMetadata("page-contact", "/contact");

export default function ContactPage() {
  return <ContentPage docKey="page-contact" />;
}
