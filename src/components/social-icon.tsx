import { Globe, MessageCircle, Send, type LucideProps } from "lucide-react";
import type { SocialPlatform } from "@/lib/socials";

/**
 * Marks for the footer's social row.
 *
 * `lucide-react` 1.x removed every brand icon, so there is no `Instagram`
 * export any more. Rather than add a second icon package — which would either
 * pull a brand set into the bundle or fetch from a CDN this product cannot
 * reach — the one glyph that has no sensible generic stand-in is drawn here, in
 * lucide's own idiom: a 24×24 box, `currentColor` strokes at width 2, round
 * caps and joins. Beside the lucide glyphs it is indistinguishable in weight.
 *
 * The other three do have honest generic equivalents: a paper plane reads as
 * Telegram, a chat bubble as WhatsApp, a globe as a website.
 */
function InstagramMark(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const SOCIAL_ICONS: Record<SocialPlatform, React.ComponentType<LucideProps>> = {
  instagram: InstagramMark,
  telegram: Send,
  whatsapp: MessageCircle,
  website: Globe,
};

export function SocialIcon({
  platform,
  ...props
}: { platform: SocialPlatform } & LucideProps) {
  const Component = SOCIAL_ICONS[platform] ?? Globe;
  return <Component {...props} />;
}
