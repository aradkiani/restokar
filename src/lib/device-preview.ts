/**
 * The widths the design editor can preview a menu at.
 *
 * Three, and chosen to straddle the breakpoints the templates actually use
 * rather than to match any particular product: 375 is the narrow phone the
 * whole menu is designed against, 768 crosses Tailwind's `sm` where the
 * templates change layout, and 1280 is the widest a menu is ever sensibly
 * read at. A set of widths that all sit on the same side of a breakpoint would
 * render three identical previews.
 */
/**
 * One device, deliberately.
 *
 * A QR menu is read on a phone. The tablet and laptop frames were showing a
 * surface almost no guest holds, and to fit them in the editor column the
 * preview had to be scaled down — a 1280px frame landed near quarter size,
 * which proved nothing about the layout and made the text unreadable. Dropping
 * them lets the phone render at its true 375px with no transform at all, which
 * is both sharper and free of the scaling artefacts that came with it.
 */
export const DEVICE_PREVIEWS = [{ id: "phone", width: 375, height: 720 }] as const;

export type DevicePreviewId = (typeof DEVICE_PREVIEWS)[number]["id"];

/**
 * Phones, because that is what a QR code is scanned with. The owner is sitting
 * at a desktop, so defaulting to the width *they* are using would quietly
 * encourage designing for the one device almost no guest holds.
 */
export const DEFAULT_DEVICE_PREVIEW: DevicePreviewId = "phone";

export function getDevicePreview(id: DevicePreviewId) {
  return (
    DEVICE_PREVIEWS.find((device) => device.id === id) ??
    DEVICE_PREVIEWS.find((device) => device.id === DEFAULT_DEVICE_PREVIEW)!
  );
}

/**
 * Where the phone frame points.
 *
 * Exported so the builder below and the route itself cannot drift apart.
 * Deliberately outside `/dashboard`: the frame loads this as a whole document,
 * and a page under that segment would drag the dashboard's own layout — the
 * sidebar and header — into the phone with it.
 */
export const DESIGN_PREVIEW_PATH = "/design-preview";

/**
 * The address of the menu shown inside the phone frame.
 *
 * Only what the *server* has to re-render belongs in this URL. Colour, font,
 * radius, overlay and surface style are CSS custom properties, so the editor
 * writes them straight into the frame's document and they follow a dragged
 * control without a reload. Template, product photos and background image
 * change the rendered markup, so they travel here and cost one reload each —
 * every one of them is a single deliberate click rather than a slider.
 */
export function buildDesignPreviewUrl({
  templateId,
  showProductPhotos,
  backgroundImage,
}: {
  templateId: string;
  showProductPhotos: boolean;
  backgroundImage?: string | null;
}): string {
  const params = new URLSearchParams({
    template: templateId,
    photos: showProductPhotos ? "1" : "0",
    /*
      Always sent, empty included.

      An absent `bg` means "no opinion" and the route falls back to the saved
      image, which is right for a direct visit and wrong here: an owner who has
      just cleared their background would go on seeing the stored one until
      they pressed save, which reads as a control that does nothing.
    */
    bg: backgroundImage ?? "",
  });

  return `${DESIGN_PREVIEW_PATH}?${params.toString()}`;
}
