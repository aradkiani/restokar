import { describe, expect, it } from "vitest";
import {
  EXCLUSIVE_TABS,
  NO_ACCESS_HREF,
  STAFF_TABS,
  STAFF_TAB_HREF,
  canAccessTab,
  exclusiveConflicts,
  landingPathFor,
  sanitiseTabs,
} from "./staff-tabs";

/**
 * Staff permissions decide who can open what, so every rule here is enforced on
 * the server. These tests cover the pure half — which tabs are real, which are
 * exclusive, and whether a given account may open a given section — so the
 * guard and the UI cannot drift apart about the answer.
 */

describe("STAFF_TABS", () => {
  it("never offers the owner-only sections", () => {
    // Settings, subscription and More Options carry billing, the venue's own
    // identity and the pricing rules. Those stay with the owner, so they are
    // not grantable at all rather than grantable-but-guarded.
    expect(STAFF_TABS).not.toContain("settings");
    expect(STAFF_TABS).not.toContain("subscription");
    expect(STAFF_TABS).not.toContain("options");
  });

  it("marks orders as exclusive", () => {
    expect(EXCLUSIVE_TABS).toContain("orders");
  });
});

describe("sanitiseTabs", () => {
  it("drops anything that is not a real tab", () => {
    // The list arrives from a request body, so an unknown key is either a stale
    // client or someone trying their luck. Neither should be stored.
    expect(sanitiseTabs(["orders", "settings", "nonsense"])).toEqual(["orders"]);
  });

  it("removes duplicates", () => {
    expect(sanitiseTabs(["qr", "qr", "qr"])).toEqual(["qr"]);
  });

  it("returns tabs in catalogue order, not the order they were sent", () => {
    // So two accounts with the same access compare equal, and the UI lists
    // them the same way every time.
    expect(sanitiseTabs(["finance", "orders", "qr"])).toEqual(
      STAFF_TABS.filter((tab) => ["finance", "orders", "qr"].includes(tab)),
    );
  });

  it("copes with an empty grant", () => {
    expect(sanitiseTabs([])).toEqual([]);
  });
});

describe("exclusiveConflicts", () => {
  const held = [
    { userId: "u1", staffTabs: ["orders", "qr"] },
    { userId: "u2", staffTabs: ["finance"] },
  ];

  it("reports orders as taken when someone else already holds it", () => {
    expect(exclusiveConflicts(["orders"], held, null)).toEqual(["orders"]);
  });

  it("lets the person who already holds it keep it", () => {
    // Editing u1 and leaving orders ticked must not collide with u1 itself,
    // or an owner could never save any other change to that account.
    expect(exclusiveConflicts(["orders", "menu"], held, "u1")).toEqual([]);
  });

  it("ignores non-exclusive tabs however many people hold them", () => {
    // Two people can both see finance; only orders is limited.
    expect(exclusiveConflicts(["finance", "qr"], held, null)).toEqual([]);
  });

  it("is clear when nobody holds it yet", () => {
    expect(exclusiveConflicts(["orders"], [], null)).toEqual([]);
  });
});

describe("canAccessTab", () => {
  it("lets an owner open everything", () => {
    for (const tab of STAFF_TABS) {
      expect(canAccessTab({ role: "OWNER", staffTabs: [] }, tab)).toBe(true);
    }
  });

  it("lets staff open only what they were granted", () => {
    const staff = { role: "STAFF" as const, staffTabs: ["orders"] };
    expect(canAccessTab(staff, "orders")).toBe(true);
    expect(canAccessTab(staff, "finance")).toBe(false);
  });

  it("gives a staff account with no grants nothing", () => {
    // The default for a new account is no access, so a half-finished one is
    // harmless rather than wide open.
    expect(canAccessTab({ role: "STAFF", staffTabs: [] }, "orders")).toBe(false);
  });

  it("does not let a stored unknown key open anything", () => {
    expect(canAccessTab({ role: "STAFF", staffTabs: ["settings"] }, "orders")).toBe(
      false,
    );
  });

  it("gives a branch manager exactly what its role already allowed", () => {
    /*
      This is the regression that matters most: introducing staff grants must
      not widen anyone else. A branch runs its own service and its own numbers
      and has never been able to touch the menu or the design, because those
      belong to the chain whose menu it serves.
    */
    const manager = { role: "BRANCH_MANAGER" as const, staffTabs: [] };

    expect(canAccessTab(manager, "orders")).toBe(true);
    expect(canAccessTab(manager, "qr")).toBe(true);
    expect(canAccessTab(manager, "analytics")).toBe(true);
    expect(canAccessTab(manager, "finance")).toBe(true);

    expect(canAccessTab(manager, "menu")).toBe(false);
    expect(canAccessTab(manager, "design")).toBe(false);
  });

  it("ignores tabs stored against a branch manager", () => {
    // Its access comes from the role, so a stray grant on the row cannot
    // extend it.
    expect(canAccessTab({ role: "BRANCH_MANAGER", staffTabs: ["menu"] }, "menu")).toBe(
      false,
    );
  });

  it("gives a platform admin nothing here", () => {
    // A SUPER_ADMIN has no tenant; its console is behind requireAdmin.
    expect(canAccessTab({ role: "SUPER_ADMIN", staffTabs: [] }, "orders")).toBe(false);
  });
});

/**
 * The regression that made the dashboard unusable for a second staff member.
 *
 * The overview sends a STAFF account to the order board, and the board requires
 * the `orders` grant — which a second staff member can never hold, because
 * orders is exclusive. Redirecting a refusal to the board therefore pointed the
 * two pages at each other and the address bar flickered between `/dashboard`
 * and `/dashboard/orders` forever. Every case here must land somewhere that
 * does not itself redirect.
 */
describe("landingPathFor", () => {
  it("never sends someone to a section they cannot open", () => {
    // The exact loop: granted menu only, refused the board.
    const staff = { role: "STAFF", staffTabs: ["menu"] };
    const landing = landingPathFor(staff);

    expect(landing).toBe(STAFF_TAB_HREF.menu);
    expect(landing).not.toBe(STAFF_TAB_HREF.orders);
  });

  it("sends an account holding nothing to a page that redirects nowhere", () => {
    expect(landingPathFor({ role: "STAFF", staffTabs: [] })).toBe(NO_ACCESS_HREF);
  });

  it("prefers the board when the account does hold it", () => {
    expect(landingPathFor({ role: "STAFF", staffTabs: ["orders", "finance"] })).toBe(
      STAFF_TAB_HREF.orders,
    );
  });

  it("resolves for an owner and a branch manager too", () => {
    expect(landingPathFor({ role: "OWNER", staffTabs: [] })).toBe(STAFF_TAB_HREF.orders);
    expect(landingPathFor({ role: "BRANCH_MANAGER", staffTabs: [] })).toBe(
      STAFF_TAB_HREF.orders,
    );
  });

  it("returns a real section path for every grantable tab", () => {
    // A tab added to the catalogue without a href would land on `undefined`.
    for (const tab of STAFF_TABS) {
      expect(STAFF_TAB_HREF[tab]).toMatch(/^\/dashboard\//);
    }
  });
});
