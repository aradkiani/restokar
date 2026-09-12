import { describe, expect, it } from "vitest";
import {
  DEVICE_PREVIEWS,
  DEFAULT_DEVICE_PREVIEW,
  DESIGN_PREVIEW_PATH,
  buildDesignPreviewUrl,
  getDevicePreview,
} from "./device-preview";

/**
 * The design editor previews one width: a phone.
 *
 * It used to offer three, straddling the templates' breakpoints. That was the
 * right idea for a product read on desktops and the wrong one for this product
 * — a QR menu is opened on a phone, and the wider frames had to be scaled down
 * so far to fit the editor column that they showed layout nobody could read.
 */

describe("DEVICE_PREVIEWS", () => {
  it("offers the phone and nothing else", () => {
    expect(DEVICE_PREVIEWS.map((d) => d.id)).toEqual(["phone"]);
  });

  it("is a real phone width, below the sm breakpoint", () => {
    // Tailwind's `sm` is 640px; above it the templates switch to their wider
    // layout and the preview would stop showing what a guest sees.
    expect(getDevicePreview("phone").width).toBeLessThan(640);
  });

  it("renders at true size, so the preview needs no scaling transform", () => {
    // The editor column is sized to hold this outright. A frame wider than a
    // phone would have to be scaled, which is what previously dragged the RTL
    // preview sideways and broke every measurement taken inside it.
    expect(getDevicePreview("phone").width).toBeLessThanOrEqual(375);
  });

  it("defaults to the phone, because that is what guests actually use", () => {
    expect(DEFAULT_DEVICE_PREVIEW).toBe("phone");
  });

  it("falls back to the default for an unknown id", () => {
    // The choice is held in component state, but a stale value must not crash
    // the editor.
    expect(getDevicePreview("watch" as never).id).toBe(DEFAULT_DEVICE_PREVIEW);
  });
});

/**
 * The preview is a real page in an iframe, so its address *is* its state.
 *
 * Only what the server has to re-render belongs in the URL. Colour, font,
 * radius and surface style reach the frame as CSS custom properties written
 * straight into its document, so they update while a control is being dragged
 * and must NOT appear here — putting them in the URL would reload the frame on
 * every frame of a colour drag.
 */
describe("buildDesignPreviewUrl", () => {
  const base = { templateId: "noir", showProductPhotos: true };

  it("points at the preview route", () => {
    expect(buildDesignPreviewUrl(base).startsWith(`${DESIGN_PREVIEW_PATH}?`)).toBe(true);
  });

  it("carries the template, so switching one reloads the frame", () => {
    const noir = buildDesignPreviewUrl(base);
    const linen = buildDesignPreviewUrl({ ...base, templateId: "linen" });

    expect(new URL(noir, "http://x").searchParams.get("template")).toBe("noir");
    expect(linen).not.toBe(noir);
  });

  it("carries the photo toggle as a distinct URL either way", () => {
    // Same URL for both states would leave the toggle looking broken: the
    // frame would not reload and the photos would not disappear.
    const on = buildDesignPreviewUrl({ ...base, showProductPhotos: true });
    const off = buildDesignPreviewUrl({ ...base, showProductPhotos: false });

    expect(on).not.toBe(off);
    expect(new URL(off, "http://x").searchParams.get("photos")).toBe("0");
  });

  it("sends the background image even when there is none", () => {
    /*
      An absent `bg` means "no opinion", and the route then falls back to the
      saved image. That is right for a direct visit and wrong for the editor:
      an owner who has just removed their background would keep seeing the
      saved one until they saved. Sending it empty states the intent.
    */
    const params = new URL(buildDesignPreviewUrl(base), "http://x").searchParams;

    expect(params.has("bg")).toBe(true);
    expect(params.get("bg")).toBe("");
  });

  it("escapes the background path rather than pasting it in", () => {
    const url = buildDesignPreviewUrl({
      ...base,
      backgroundImage: "/uploads/tenant one/a b.jpg",
    });

    expect(url).not.toContain(" ");
    expect(new URL(url, "http://x").searchParams.get("bg")).toBe(
      "/uploads/tenant one/a b.jpg",
    );
  });
});
