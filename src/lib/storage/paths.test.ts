import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentTypeFor, resolveUploadPath, UPLOADS_ROOT } from "./paths";

/**
 * Uploads moved out of `public/` and are now served by a route handler, which
 * means this code — not the framework — is what stands between a URL and the
 * filesystem. These are the tests for that boundary.
 */

describe("resolveUploadPath", () => {
  const valid = ["cmsp0auub0001asuf7286tb9s", "b470ae38e58b615411d011315fd7d7a5.jpg"];

  it("resolves a genuine upload path inside the uploads root", () => {
    const resolved = resolveUploadPath(valid);
    expect(resolved).not.toBeNull();
    expect(resolved!.startsWith(UPLOADS_ROOT)).toBe(true);
    expect(resolved).toBe(path.join(UPLOADS_ROOT, ...valid));
  });

  it("refuses a parent-directory segment", () => {
    expect(resolveUploadPath(["..", "..", ".env"])).toBeNull();
    expect(resolveUploadPath([valid[0]!, "..", "..", ".env"])).toBeNull();
  });

  it("refuses a segment containing a separator", () => {
    // A single decoded segment must never smuggle a path of its own.
    expect(resolveUploadPath(["a/../../etc/passwd"])).toBeNull();
    expect(resolveUploadPath(["a\\..\\..\\windows"])).toBeNull();
  });

  it("refuses an absolute path", () => {
    expect(resolveUploadPath(["/etc/passwd"])).toBeNull();
    expect(resolveUploadPath(["C:\\Windows\\win.ini"])).toBeNull();
  });

  it("refuses a NUL byte, which can truncate a path downstream", () => {
    expect(resolveUploadPath([valid[0]!, "file.jpg\0.txt"])).toBeNull();
  });

  it("refuses empty and over-deep paths", () => {
    expect(resolveUploadPath([])).toBeNull();
    expect(resolveUploadPath(["a", "b", "c", "d", "e"])).toBeNull();
  });

  it("refuses characters our own generated names never contain", () => {
    // Names are cuids and hex tokens; anything else did not come from us.
    expect(resolveUploadPath([valid[0]!, "file name.jpg"])).toBeNull();
    expect(resolveUploadPath([valid[0]!, "file;rm.jpg"])).toBeNull();
    expect(resolveUploadPath([valid[0]!, "$(whoami).jpg"])).toBeNull();
  });

  it("never returns a path outside the uploads root", () => {
    const attempts = [
      ["..", "secrets.jpg"],
      [".", "..", "..", "package.json"],
      ["....", "package.json"],
    ];
    for (const attempt of attempts) {
      const resolved = resolveUploadPath(attempt);
      if (resolved !== null) {
        expect(path.relative(UPLOADS_ROOT, resolved).startsWith("..")).toBe(false);
      }
    }
  });
});

describe("contentTypeFor", () => {
  it("maps our own extensions to image types", () => {
    expect(contentTypeFor("/x/a.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("/x/a.png")).toBe("image/png");
    expect(contentTypeFor("/x/a.webp")).toBe("image/webp");
    expect(contentTypeFor("/x/a.gif")).toBe("image/gif");
  });

  it("is case-insensitive about the extension", () => {
    expect(contentTypeFor("/x/a.JPG")).toBe("image/jpeg");
  });

  it("refuses anything not on the list, so stored bytes are never served as script", () => {
    expect(contentTypeFor("/x/a.svg")).toBeNull();
    expect(contentTypeFor("/x/a.html")).toBeNull();
    expect(contentTypeFor("/x/a.js")).toBeNull();
    expect(contentTypeFor("/x/a")).toBeNull();
  });
});
