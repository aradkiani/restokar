import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageTab } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getMenuForPreview } from "@/lib/menu";
import { ThemeSchema, resolveTheme, themeToCssVars } from "@/lib/theme";
import { getTemplateMeta } from "@/templates/registry";
import { MenuView } from "@/templates/menu-view";
import { MenuBackdrop } from "@/components/menu-background";

/**
 * The design editor's phone frame, as a real page.
 *
 * The editor used to render the templates inline and *simulate* a viewport
 * around them: a fixed-width scrolling div, the phone's height published to
 * templates as `--m-vh`, and a hand-written background that stood in for the
 * page-level one. Every simulated property is a property that can drift from
 * the real thing, and all of them had — a template's `position: fixed` layer
 * escaped the frame and painted across the whole dashboard, `min-h-dvh`
 * measured the dashboard window, the scroller overhung its own frame by 41px
 * and clipped the cart button off the edge, and the category rail's
 * `scrollIntoView` walked out into the dashboard and dragged it sideways.
 *
 * An iframe is not a simulated viewport, it is one. `fixed` resolves to the
 * phone, `dvh` measures the phone, the frame cannot be overflowed because the
 * iframe *is* the frame, and there is no scrollable ancestor to escape into.
 * The whole class of bug stops being reachable rather than being fixed one
 * instance at a time.
 *
 * Deliberately not under `/dashboard`: this loads as a whole document, and that
 * segment's layout would put the sidebar inside the phone.
 */
export const metadata: Metadata = {
  title: "پیش‌نمایش طراحی",
  // Owner-only and behind a session, but a preview URL must never be a second,
  // crawlable copy of a venue's menu competing with the real one.
  robots: { index: false, follow: false },
};

// Reflects unsaved editor state and the caller's session; nothing here is
// cacheable.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ template?: string; photos?: string; bg?: string }>;
}

/**
 * The background image the frame should paint.
 *
 * An absent `bg` means the caller has no opinion — a direct visit — and the
 * saved image stands. An empty one is an explicit "none", which is how the
 * editor shows a background the owner has just cleared but not yet saved.
 *
 * Anything else is validated against the same rule the stored theme uses.
 * React does not sanitise CSS values, and this one arrives in a query string,
 * so an unconstrained value here would let an owner inject declarations into
 * their own `background-image`. Reusing `ThemeSchema`'s field keeps one rule
 * rather than a second copy that can rot.
 */
function resolveBackgroundImage(bg: string | undefined, saved: string | null) {
  if (bg === undefined) return saved;
  if (bg === "") return null;

  const parsed = ThemeSchema.shape.backgroundImage.safeParse(bg);
  return parsed.success ? (parsed.data ?? null) : null;
}

export default async function DesignPreviewPage({ searchParams }: PageProps) {
  // The tenant comes from the session, never the URL — same rule as every other
  // tenant-scoped route. `/dashboard/design` is where a signed-out owner lands,
  // because this page on its own is not somewhere to arrive.
  const { restaurantId } = await requirePageTab("design", "/dashboard/design");
  const { locale } = await getI18n();
  const { template, photos, bg } = await searchParams;

  const [restaurant, preview] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { theme: true },
    }),
    /*
      `getMenuForPreview`, not `getPublicMenu`.

      The public reader returns null unless the venue is active *and*
      published, so pointing this frame at `/menu/<slug>` would show "menu not
      found" to exactly the person who needs it most: an owner designing a menu
      they have not published yet.
    */
    getMenuForPreview(restaurantId),
  ]);

  if (!preview) notFound();

  // An unknown or missing template falls back to the venue's saved one, then to
  // the platform default — a stale value in the editor must not blank the frame.
  const meta = getTemplateMeta(template ?? preview.templateId);

  /*
    Resolved against the *requested* template's defaults, not the saved one's.
    Switching template in the editor clears the colour overrides so the new
    template's own palette shows, and resolving against the old defaults would
    render the first paint in the outgoing template's colours.
  */
  const resolved = resolveTheme(restaurant?.theme, meta.defaultTheme);
  const backgroundImage = resolveBackgroundImage(bg, resolved.backgroundImage);
  const theme = { ...resolved, backgroundImage };

  const showProductPhotos =
    photos === undefined ? preview.data.restaurant.showProductPhotos : photos === "1";

  const data = {
    ...preview.data,
    restaurant: { ...preview.data.restaurant, showProductPhotos },
  };

  /*
    The tokens go in a `:root` rule, not inline on the wrapper below.

    The public menu sets them inline and should keep doing so — nothing else
    writes to that page. Here the editor pushes unsaved colour changes straight
    into this document, and `iframe.onload` fires when the *document* has
    loaded, which is before React inside it has hydrated. Writing to the
    wrapper's `style` therefore raced hydration: React would find an attribute
    string it had not produced and report a mismatch it refused to patch. The
    values were identical every time — only the serialisation differed — which
    is what made the error look nonsensical in the console.

    Moving them to `:root` means the editor can target `documentElement`
    instead. An inline style on `<html>` outranks this rule, so the override
    still wins, and the root layout already carries `suppressHydrationWarning`
    precisely because that element is expected to be written to from outside.
  */
  const rootTokens = Object.entries(themeToCssVars(theme))
    .map(([token, value]) => `${token}:${value}`)
    .join(";");

  return (
    // The same three things the public menu renders, in the same order, so the
    // owner is approving the page guests actually get.
    <div className="menu-scope" dir={locale === "fa" ? "rtl" : "ltr"} lang={locale}>
      {/*
        Every value here comes from `themeToCssVars` — hex colours the schema
        validated, computed rgba, integer pixels and a font stack from a
        constant. None can contain the `<` that would be needed to break out of
        this element, so the interpolation is closed by the shape of the data
        rather than by escaping it here.
      */}
      <style href="design-preview-theme" precedence="high">
        {`:root{${rootTokens}}`}
      </style>

      {/*
        Stops a scroll that started in the phone from continuing into the
        dashboard once the menu runs out — at the bottom *and* at the top. The
        inline preview had this as Tailwind's `overscroll-contain` on its
        scrolling div; moving to an iframe dropped it, because the element that
        scrolls is now the frame's own root rather than a div we style.

        It has to be `html`. `overscroll-behavior` is read off the root element
        for the viewport's scroll box, and the spec explicitly does not let it
        propagate up from `body` the way `overflow` does — set on the wrapper
        below it would simply do nothing. Hoisted into this document's <head>
        rather than written inline on the element, since the root here belongs
        to the shared layout.

        Scoped to this route by construction: it is inside the frame, so it can
        reach neither a guest's real menu nor the dashboard around it. A browser
        without `overscroll-behavior` ignores the declaration and chains as it
        does today, which is the current behaviour rather than a broken one.
      */}
      <style href="design-preview-scroll-lock" precedence="high">
        {"html{overscroll-behavior-y:contain}"}
      </style>

      <MenuBackdrop image={backgroundImage} />

      <MenuView
        data={data}
        theme={theme}
        templateId={meta.id}
        locale={locale}
        /*
          Keeps the cart drawer's checkout replaced by a preview notice. The
          order endpoint is public and unauthenticated, so without this an owner
          poking at their own preview could put a real order in their kitchen
          queue and their revenue figures.
        */
        preview
      />
    </div>
  );
}
