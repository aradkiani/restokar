/**
 * Which dashboard sections a staff account may be given.
 *
 * Free of any database import, like pricing.ts, because this decides who can
 * open what and that answer has to be testable on its own. The guard, the API
 * and the sidebar all read these functions rather than each deciding for
 * themselves — a permission system where two places disagree is a permission
 * system with a hole in it.
 */

/**
 * The grantable sections.
 *
 * Settings, subscription and More Options are deliberately absent. They carry
 * billing, the venue's own identity and the rules that decide what every guest
 * is charged, so they stay with the owner — and being absent from this list
 * means they cannot be granted at all, rather than being grantable and relying
 * on a second check to refuse.
 */
export const STAFF_TABS = [
  "orders",
  "menu",
  "design",
  "qr",
  "analytics",
  "finance",
] as const;

export type StaffTab = (typeof STAFF_TABS)[number];

/**
 * Sections only one account may hold at a time.
 *
 * Orders is the one place two people acting at once actively conflict: the
 * board is a queue that staff advance through statuses, and two hands moving
 * the same ticket is how an order gets cooked twice or handed over before it is
 * ready. Everything else is either read-only or edits rows that do not race.
 */
export const EXCLUSIVE_TABS = ["orders"] as const satisfies readonly StaffTab[];

/**
 * What a BRANCH_MANAGER holds by virtue of its role.
 *
 * Not a grant — nobody chooses these — but stated here so `canAccessTab` can
 * answer for every role from one place. It is exactly what
 * `requireBranchOperator` already allowed: a branch runs its own service and
 * its own numbers, and the menu and design belong to the chain that owns them.
 */
export const BRANCH_MANAGER_TABS = [
  "orders",
  "qr",
  "analytics",
  "finance",
] as const satisfies readonly StaffTab[];

/** Where each grantable section lives. */
export const STAFF_TAB_HREF = {
  orders: "/dashboard/orders",
  menu: "/dashboard/menu",
  design: "/dashboard/design",
  qr: "/dashboard/qr",
  analytics: "/dashboard/analytics",
  finance: "/dashboard/finance",
} as const satisfies Record<StaffTab, string>;

/** Shown to an account that holds nothing; it renders for any signed-in user. */
export const NO_ACCESS_HREF = "/dashboard/no-access";

/**
 * Where to send someone who has just been refused a page.
 *
 * This exists because "send them to the order board" was wrong and looped. The
 * overview bounces a STAFF account to `/dashboard/orders`, and the board now
 * requires the `orders` grant — which a second staff member at a venue can
 * never hold, since orders is exclusive. The two redirects then pointed at each
 * other and the address bar flickered between them forever.
 *
 * So the landing page is derived from what the account actually holds, and the
 * fallback is a page that redirects nowhere. A refusal must always terminate.
 */
export function landingPathFor(user: {
  role: string;
  staffTabs?: readonly string[] | null;
}): string {
  const first = STAFF_TABS.find((tab) => canAccessTab(user, tab));
  return first ? STAFF_TAB_HREF[first] : NO_ACCESS_HREF;
}

export function isStaffTab(value: string): value is StaffTab {
  return (STAFF_TABS as readonly string[]).includes(value);
}

/**
 * Cleans a requested grant into something storable.
 *
 * Drops unknown keys, removes duplicates, and returns catalogue order so two
 * accounts with the same access compare equal and list identically. The input
 * comes from a request body, so an unrecognised key is either a stale client or
 * someone trying an owner-only section — both are dropped rather than refused,
 * because there is no useful difference to report.
 */
export function sanitiseTabs(values: readonly string[]): StaffTab[] {
  const wanted = new Set(values.filter(isStaffTab));
  return STAFF_TABS.filter((tab) => wanted.has(tab));
}

/**
 * Which of the requested exclusive tabs somebody else already holds.
 *
 * `editingUserId` is the account being saved, and is excluded from the check:
 * without it, editing the person who currently runs the board would collide
 * with themselves and the owner could never change anything else about that
 * account.
 */
export function exclusiveConflicts(
  requested: readonly string[],
  held: readonly { userId: string; staffTabs: readonly string[] }[],
  editingUserId: string | null,
): StaffTab[] {
  const wanted = new Set(sanitiseTabs(requested));

  return EXCLUSIVE_TABS.filter(
    (tab) =>
      wanted.has(tab) &&
      held.some(
        (other) => other.userId !== editingUserId && other.staffTabs.includes(tab),
      ),
  );
}

/**
 * Whether an account may open a section.
 *
 * An OWNER may open anything. A BRANCH_MANAGER holds a fixed set that comes
 * with the role — unchanged from what `requireBranchOperator` already allowed,
 * so adding staff grants widens nothing for anyone else. A STAFF account may
 * open exactly what it was granted, and an empty grant is no access, so a
 * half-finished account is harmless. A SUPER_ADMIN has no tenant to have tabs
 * in and answers `false`.
 */
export function canAccessTab(
  user: { role: string; staffTabs?: readonly string[] | null },
  tab: StaffTab,
): boolean {
  if (user.role === "OWNER") return true;
  if (user.role === "BRANCH_MANAGER") {
    return (BRANCH_MANAGER_TABS as readonly string[]).includes(tab);
  }
  if (user.role !== "STAFF") return false;

  // Sanitised rather than trusted: a key stored before a section was retired
  // must not keep opening it.
  return sanitiseTabs(user.staffTabs ?? []).includes(tab);
}
