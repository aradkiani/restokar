/**
 * The tenant background image.
 *
 * "Stay put while the content scrolls" depends on *what* is scrolling, and
 * getting that wrong is how this drifted before: the design preview once
 * reimplemented the background as `position: absolute; inset: 0` inside a
 * scrolling box. An absolutely positioned layer is sized to its container's
 * padding box — one screenful — and then scrolls away with the content, so the
 * image covered the first category and everything below it fell back to the
 * flat `--m-bg` colour.
 *
 * It lives here so the page and the preview cannot disagree again.
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
