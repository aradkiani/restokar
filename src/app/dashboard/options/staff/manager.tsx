"use client";

import * as React from "react";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { api } from "@/lib/client-api";
import { localizeApiError, localizeFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { EXCLUSIVE_TABS, grantableTabs, type StaffTab } from "@/lib/staff-tabs";

interface StaffRow {
  id: string;
  name: string;
  phone: string | null;
  staffTabs: string[];
  /** The site they work at: the venue itself or one of its branches. */
  siteId: string;
}

interface Site {
  id: string;
  name: string;
  isBranch: boolean;
}

/**
 * Staff accounts and their access.
 *
 * The tab list is rendered from STAFF_TABS rather than written out here, so a
 * section that becomes grantable appears in this form without anyone
 * remembering to add it — and one that stops being grantable disappears from
 * it. The server sanitises the same list, so the two cannot disagree about
 * what is real.
 *
 * A chain owner picks the site too: a branch cashier works that branch's order
 * board and till, and can hold only what a branch has — never the menu.
 */
export function StaffManager({
  initialStaff,
  sites,
}: {
  initialStaff: StaffRow[];
  sites: Site[];
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [staff, setStaff] = React.useState<StaffRow[]>(initialStaff);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tabs, setTabs] = React.useState<StaffTab[]>([]);
  const [siteId, setSiteId] = React.useState(sites[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);

  const siteById = new Map(sites.map((site) => [site.id, site]));
  const tabsAt = (id: string) => grantableTabs(siteById.get(id)?.isBranch ?? false);
  const chain = sites.length > 1;

  /** Dashboard sections already carry a translated name; reuse it. */
  const tabLabel: Record<StaffTab, string> = {
    orders: t.dashboard.orders,
    menu: t.dashboard.menu,
    design: t.dashboard.design,
    qr: t.dashboard.qr,
    analytics: t.dashboard.analytics,
    finance: t.dashboard.finance,
    inventory: t.dashboard.inventory,
  };

  /** Who holds each exclusive tab at a site, so the form can say so up front. */
  const holderOf = (tab: StaffTab, site: string, exceptId?: string) =>
    staff.find(
      (row) => row.siteId === site && row.id !== exceptId && row.staffTabs.includes(tab),
    );

  function toggleNewTab(tab: StaffTab) {
    setTabs((current) =>
      current.includes(tab) ? current.filter((x) => x !== tab) : [...current, tab],
    );
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const allowed = tabsAt(siteId);
    const result = await api.post("/api/staff", {
      name,
      phone,
      tabs: tabs.filter((tab) => allowed.includes(tab)),
      password,
      siteId,
    });
    setBusy(false);

    if (!result.ok) {
      const fields = localizeFieldErrors(result.error.details, t);
      toast.error(
        fields.phone ??
          fields.name ??
          fields.password ??
          localizeApiError(result.error, t),
      );
      return;
    }

    setStaff((current) => [...current, result.data as StaffRow]);
    setName("");
    setPhone("");
    setPassword("");
    setTabs([]);
  }

  async function setAccess(row: StaffRow, tab: StaffTab) {
    const next = row.staffTabs.includes(tab)
      ? row.staffTabs.filter((x) => x !== tab)
      : [...row.staffTabs, tab];

    const previous = row.staffTabs;
    setStaff((current) =>
      current.map((r) => (r.id === row.id ? { ...r, staffTabs: next } : r)),
    );

    const result = await api.patch(`/api/staff/${row.id}`, { tabs: next });
    if (!result.ok) {
      // Put it back: the server refused, most likely because someone else
      // already runs the order board.
      setStaff((current) =>
        current.map((r) => (r.id === row.id ? { ...r, staffTabs: previous } : r)),
      );
      toast.error(result.error.message);
    }
  }

  async function remove(row: StaffRow) {
    if (!window.confirm(t.options.staffRemoveConfirm)) return;

    const result = await api.del(`/api/staff/${row.id}`);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setStaff((current) => current.filter((r) => r.id !== row.id));
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t.options.staffTitle}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs leading-6 text-ink-500">{t.options.staffHint}</p>

          <form onSubmit={create} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t.options.staffName} htmlFor="staff-name">
                <input
                  id="staff-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
                />
              </Field>

              <Field
                label={t.options.staffPhone}
                hint={t.options.staffPhoneHint}
                htmlFor="staff-phone"
                className="sm:col-span-2"
              >
                <input
                  id="staff-phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder={t.auth.phonePlaceholder}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
                />
              </Field>

              <Field
                label={t.auth.initialPassword}
                hint={t.auth.initialPasswordHint}
                htmlFor="staff-password"
                className="sm:col-span-3"
              >
                <input
                  id="staff-password"
                  type="text"
                  dir="ltr"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
                />
              </Field>
            </div>

            {chain && (
              <Field
                label={t.options.staffSite}
                hint={t.options.staffSiteHint}
                htmlFor="staff-site"
              >
                <select
                  id="staff-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="h-11 w-full rounded-[var(--radius-sm)] border border-ink-200 bg-surface px-3 text-sm font-semibold"
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-800">
                {t.options.staffAccess}
              </p>
              <div className="flex flex-wrap gap-2">
                {tabsAt(siteId).map((tab) => {
                  const holder = holderOf(tab, siteId);
                  const locked =
                    (EXCLUSIVE_TABS as readonly string[]).includes(tab) && !!holder;

                  return (
                    <button
                      key={tab}
                      type="button"
                      disabled={locked}
                      onClick={() => toggleNewTab(tab)}
                      title={locked ? holder?.name : undefined}
                      className={cn(
                        "tap-safe min-h-11 rounded-full px-3.5 text-xs font-bold transition-colors",
                        locked
                          ? "cursor-not-allowed bg-ink-100 text-ink-400 line-through"
                          : tabs.includes(tab)
                            ? "bg-brand-600 text-white"
                            : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                      )}
                    >
                      {tabLabel[tab]}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit" disabled={busy}>
              <UserPlus className="size-4" />
              {t.options.staffAdd}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {staff.length === 0 ? (
            <p className="py-12 text-center text-sm font-semibold text-ink-500">
              {t.options.noStaff}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {staff.map((row) => (
                <li key={row.id} className="space-y-2.5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">{row.name}</p>
                      <p dir="ltr" className="truncate text-xs text-ink-500">
                        {row.phone}
                      </p>
                      {chain && (
                        <p className="mt-0.5 truncate text-[11px] font-bold text-brand-700">
                          {siteById.get(row.siteId)?.name}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(row)}
                      aria-label={`${t.common.delete} ${row.name}`}
                      className="tap-safe grid size-11 place-items-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {tabsAt(row.siteId).map((tab) => {
                      const on = row.staffTabs.includes(tab);
                      const takenBy = holderOf(tab, row.siteId, row.id);
                      const locked =
                        (EXCLUSIVE_TABS as readonly string[]).includes(tab) &&
                        !!takenBy &&
                        !on;

                      return (
                        <button
                          key={tab}
                          type="button"
                          disabled={locked}
                          onClick={() => setAccess(row, tab)}
                          title={locked ? takenBy?.name : undefined}
                          className={cn(
                            "tap-safe min-h-11 rounded-full px-3 text-[11px] font-bold transition-colors",
                            locked
                              ? "cursor-not-allowed bg-ink-100 text-ink-400 line-through"
                              : on
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-ink-100 text-ink-500 hover:bg-ink-200",
                          )}
                        >
                          {tabLabel[tab]}
                        </button>
                      );
                    })}
                  </div>

                  {row.staffTabs.length === 0 && (
                    <p className="text-[11px] font-semibold text-amber-700">
                      {t.options.staffNoAccess}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
