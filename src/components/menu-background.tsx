import type { CSSProperties } from "react";

/**
 * The tenant background image, in the two forms the app actually needs.
 *
 * There are two, because "stay put while the content scrolls" is a different
 * problem depending on *what* is scrolling, and getting that wrong is exactly
 * how this drifted before: the design preview reimplemented the background as
 * `position: absolute; inset: 0` inside a scrolling box. An absolutely
 * positioned layer is sized to its container's padding box — one screenful —
 * and then scrolls away with the content, so the image covered the first
 * category and everything below it fell back to the flat `--m-bg` colour.
 *
 * Both helpers live here so the page and the preview cannot disagree again.
 */

/**
 * Page-level backdrop: the whole document scrolls, so the layers are pinned to
 * the viewport with `position: fixed` (see `.menu-bg-image` in globals.css).
 *
 * Rendered *before* the content, which every menu surface wraps in
 * `relative z-10` so it sits above both layers.
 */
export function MenuBackdrop({ image }: { image: string | null | undefined }) {
  if (!image) return null;

  return (
    <>
      <div
        className="menu-bg-image"
        // JSON.stringify quotes the value. The URL is already constrained by
        // ThemeSchema to an /uploads path or an https origin, so this is a
        // second line of defence rather than the only one.
        style={{ backgroundImage: `url(${JSON.stringify(image)})` }}
        aria-hidden
      />
      <div className="menu-bg-overlay" aria-hidden />
    </>
  );
}

/**
 * Backdrop for a menu rendered inside a scrolling *element* — the phone mock in
 * the design editor — where `position: fixed` is not an option: a fixed layer
 * escapes the mock and covers the whole dashboard.
 *
 * The trick is that a background painted on the scroll container itself does
 * not move with the content. `background-attachment: scroll` — the default,
 * stated here because the intent is the whole point — fixes the background to
 * this element's own box; `local` is the value that would scroll it away. The
 * result matches what a guest sees on the real page.
 *
 * The overlay rides along as a flat gradient layer rather than a second
 * element, so both surfaces compose image and overlay in the same order: first
 * layer paints on top.
 */
export function containedBackdropStyle(image: string | null | undefined): CSSProperties {
  if (!image) return {};

  return {
    backgroundImage: `linear-gradient(var(--m-overlay), var(--m-overlay)), url(${JSON.stringify(image)})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "scroll",
  };
}
