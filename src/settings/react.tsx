"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AgendaEventType, AgendaHost, WeeklyWindow } from "../core/types.js";
import { SETTINGS_LABELS, type AgendaSettingsLabels } from "./labels.js";

export { SETTINGS_LABELS, type AgendaSettingsLabels } from "./labels.js";

type Provider = "google" | "microsoft" | "caldav" | "ics";

type Connection = {
  id: string;
  hostId: string;
  provider: Provider;
  account: string | null;
  status: "ok" | "error";
  lastError: string | null;
  lastSyncedAt: string | null;
};

type SettingsData = {
  eventTypes: AgendaEventType[];
  hosts: AgendaHost[];
  connections: Connection[];
  providers: Record<Provider, boolean>;
  holidayCalendars: Array<{ code: string; label: string }>;
};

export type AgendaSettingsEndpoints = {
  /** `settingsGet` (GET) and `settingsSaveEventType` (PUT) mounted on the same path. */
  settings: string;
  /** `settingsUpdateHost` (PATCH). */
  host: string;
  /** `calendarsManage` (POST / DELETE). */
  calendars: string;
  /** `calendarOAuthStart` (GET, navigated to). */
  oauthStart: string;
};

export type AgendaSettingsPanelProps = {
  endpoints: AgendaSettingsEndpoints;
  /** Path the OAuth flow comes back to (usually the current page). */
  returnTo: string;
  locale?: "it" | "en";
  labels?: Partial<AgendaSettingsLabels>;
  /** Show the team section (hosts and calendars). Default true. */
  showTeam?: boolean;
  className?: string;
};

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : String(res.status));
  return data as T;
}

// ─── Weekly hours editor ────────────────────────────────────────────────────

function WindowsEditor({
  windows,
  onChange,
  showCapacity,
  l,
}: {
  windows: WeeklyWindow[];
  onChange: (next: WeeklyWindow[]) => void;
  showCapacity: boolean;
  l: AgendaSettingsLabels;
}) {
  const update = (index: number, patch: Partial<WeeklyWindow>) => onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  return (
    <div className="ags-week">
      {WEEK_ORDER.map((day) => {
        const items = windows.map((w, index) => ({ w, index })).filter((x) => x.w.day === day);
        return (
          <div key={day} className="ags-day">
            <span className="ags-day-name">{l.weekdays[day]}</span>
            <div className="ags-day-windows">
              {items.length === 0 && <span className="ags-muted">{l.closed}</span>}
              {items.map(({ w, index }) => (
                <div key={index} className="ags-window">
                  <label>
                    <span className="ags-sr">{l.from}</span>
                    <input type="time" step={300} value={w.start} onChange={(e) => update(index, { start: e.target.value })} />
                  </label>
                  <span aria-hidden>–</span>
                  <label>
                    <span className="ags-sr">{l.to}</span>
                    <input type="time" step={300} value={w.end} onChange={(e) => update(index, { end: e.target.value })} />
                  </label>
                  {showCapacity && (
                    <label className="ags-capacity">
                      <span>{l.places}</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={w.capacity ?? 1}
                        onChange={(e) => update(index, { capacity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                      />
                    </label>
                  )}
                  <button type="button" className="ags-icon-btn" aria-label={l.remove} title={l.remove} onClick={() => onChange(windows.filter((_, i) => i !== index))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ags-link"
              onClick={() => {
                const last = items.at(-1)?.w;
                onChange([...windows, { day, start: last ? last.end : "09:00", end: last ? "18:00" : "13:00" }]);
              }}
            >
              + {l.addWindow}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="ags-card">
      <h3 className="ags-card-title">{title}</h3>
      {hint && <p className="ags-hint">{hint}</p>}
      {children}
    </section>
  );
}

// ─── Team member ────────────────────────────────────────────────────────────

function HostCard({
  host,
  connections,
  providers,
  baseWeekly,
  endpoints,
  returnTo,
  l,
  onChanged,
}: {
  host: AgendaHost;
  connections: Connection[];
  providers: Record<Provider, boolean>;
  baseWeekly: WeeklyWindow[];
  endpoints: AgendaSettingsEndpoints;
  returnTo: string;
  l: AgendaSettingsLabels;
  onChanged: () => void;
}) {
  const saved = host.weekly ?? null;
  const [custom, setCustom] = useState<WeeklyWindow[] | null>(saved);
  const [form, setForm] = useState<null | "caldav" | "ics">(null);
  const [fields, setFields] = useState({ username: "", password: "", server: "", url: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await call(endpoints.host, { method: "PATCH", body: JSON.stringify({ hostId: host.id, ...body }) });
      onChanged();
    } catch (e) {
      setError(`${l.saveError}: ${l.errors[(e as Error).message] ?? (e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const body =
        form === "caldav"
          ? { hostId: host.id, provider: "caldav", username: fields.username, password: fields.password, server: fields.server }
          : { hostId: host.id, provider: "ics", url: fields.url, label: fields.label };
      await call(endpoints.calendars, { method: "POST", body: JSON.stringify(body) });
      setForm(null);
      setFields({ username: "", password: "", server: "", url: "", label: "" });
      onChanged();
    } catch (e) {
      setError(`${l.connectFailed}: ${l.errors[(e as Error).message] ?? (e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const oauthHref = (provider: "google" | "microsoft") =>
    `${endpoints.oauthStart}${endpoints.oauthStart.includes("?") ? "&" : "?"}${new URLSearchParams({ provider, hostId: host.id, returnTo })}`;

  return (
    <article className={`ags-host${host.active ? "" : " is-inactive"}`}>
      <header className="ags-host-head">
        <div>
          <strong>{host.name}</strong>
          {host.email && <span className="ags-muted"> · {host.email}</span>}
        </div>
        <label className="ags-switch">
          <input type="checkbox" checked={host.active} disabled={busy} onChange={(e) => void patch({ active: e.target.checked })} />
          <span>{host.active ? l.active : l.inactive}</span>
        </label>
      </header>

      <div className="ags-host-block">
        <p className="ags-label">{l.calendars}</p>
        {connections.length === 0 && <p className="ags-muted">{l.noCalendars}</p>}
        <ul className="ags-connections">
          {connections.map((c) => (
            <li key={c.id}>
              <span className={`ags-badge ags-badge-${c.status}`}>{c.status === "ok" ? l.statusOk : l.statusError}</span>
              <span className="ags-conn-name">
                {l.providerNames[c.provider]} · {c.account ?? "—"}
              </span>
              {c.status === "error" && c.lastError && <span className="ags-conn-error">{c.lastError}</span>}
              {c.lastSyncedAt && (
                <span className="ags-muted ags-small">
                  {l.lastSync}: {new Date(c.lastSyncedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
              <button
                type="button"
                className="ags-link ags-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await call(endpoints.calendars, { method: "DELETE", body: JSON.stringify({ id: c.id }) });
                    onChanged();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {l.disconnect}
              </button>
            </li>
          ))}
        </ul>
        <div className="ags-connect">
          {(["google", "microsoft"] as const).map((p) =>
            providers[p] ? (
              <a key={p} className="ags-btn ags-btn-ghost" href={oauthHref(p)}>
                {p === "google" ? l.connectGoogle : l.connectMicrosoft}
              </a>
            ) : (
              <span key={p} className="ags-btn ags-btn-ghost is-disabled" title={l.notConfigured} aria-disabled>
                {p === "google" ? l.connectGoogle : l.connectMicrosoft}
              </span>
            ),
          )}
          <button type="button" className="ags-btn ags-btn-ghost" disabled={!providers.caldav} title={providers.caldav ? undefined : l.notConfigured} onClick={() => setForm(form === "caldav" ? null : "caldav")}>
            {l.connectApple}
          </button>
          <button type="button" className="ags-btn ags-btn-ghost" disabled={!providers.ics} title={providers.ics ? undefined : l.notConfigured} onClick={() => setForm(form === "ics" ? null : "ics")}>
            {l.connectIcs}
          </button>
        </div>
        {form && (
          <form
            className="ags-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            {form === "caldav" ? (
              <>
                <p className="ags-hint">{l.appleHelp}</p>
                <label className="ags-field">
                  <span>{l.appleId}</span>
                  <input type="email" autoComplete="off" value={fields.username} onChange={(e) => setFields({ ...fields, username: e.target.value })} required />
                </label>
                <label className="ags-field">
                  <span>{l.applePassword}</span>
                  <input type="password" autoComplete="new-password" value={fields.password} onChange={(e) => setFields({ ...fields, password: e.target.value })} required />
                </label>
                <label className="ags-field">
                  <span>{l.caldavServer}</span>
                  <input type="url" placeholder="https://caldav.icloud.com" value={fields.server} onChange={(e) => setFields({ ...fields, server: e.target.value })} />
                </label>
              </>
            ) : (
              <>
                <p className="ags-hint">{l.icsHelp}</p>
                <label className="ags-field">
                  <span>{l.icsUrl}</span>
                  <input type="url" inputMode="url" placeholder="https://…/basic.ics" value={fields.url} onChange={(e) => setFields({ ...fields, url: e.target.value })} required />
                </label>
                <label className="ags-field">
                  <span>{l.icsLabel}</span>
                  <input value={fields.label} onChange={(e) => setFields({ ...fields, label: e.target.value })} />
                </label>
              </>
            )}
            <div className="ags-actions">
              <button type="submit" className="ags-btn" disabled={busy}>
                {busy ? l.connecting : l.connect}
              </button>
              <button type="button" className="ags-btn ags-btn-ghost" onClick={() => setForm(null)}>
                {l.cancel}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="ags-host-block">
        <p className="ags-label">{l.personalHours}</p>
        <div className="ags-radios">
          <label>
            <input type="radio" checked={custom === null} onChange={() => setCustom(null)} /> {l.sameHours}
          </label>
          <label>
            <input type="radio" checked={custom !== null} onChange={() => setCustom(saved ?? baseWeekly.map(({ capacity: _c, ...w }) => w))} /> {l.customHours}
          </label>
        </div>
        {custom && <WindowsEditor windows={custom} onChange={setCustom} showCapacity={false} l={l} />}
        {JSON.stringify(custom) !== JSON.stringify(saved) && (
          <button type="button" className="ags-btn" disabled={busy} onClick={() => void patch({ weekly: custom })}>
            {l.saveHours}
          </button>
        )}
      </div>
      {error && <p className="ags-error" role="alert">{error}</p>}
    </article>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

/**
 * Settings page for agenda owners: hours and days, simultaneous places,
 * holidays and closed days, who takes bookings, and each team member's
 * personal hours and connected calendars.
 */
export function AgendaSettingsPanel(props: AgendaSettingsPanelProps) {
  const l: AgendaSettingsLabels = { ...SETTINGS_LABELS[props.locale ?? "it"], ...props.labels };
  const [data, setData] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgendaEventType | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [newDate, setNewDate] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await call<SettingsData>(props.endpoints.settings);
      setData(next);
      setLoadError(false);
      return next;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [props.endpoints.settings]);

  useEffect(() => {
    void load().then((next) => {
      const first = next?.eventTypes[0];
      if (first) {
        setSelectedId(first.id);
        setDraft(first);
      }
    });
    // Result of an OAuth round trip (…?calendar=connected|error&reason=…).
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (result) {
      const reason = params.get("reason") ?? "";
      setFlash(result === "connected" ? l.connected : `${l.connectFailed}: ${l.errors[reason] ?? reason}`);
      params.delete("calendar");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    const et = data?.eventTypes.find((x) => x.id === id) ?? null;
    setSelectedId(id);
    setDraft(et);
    setStatus({ kind: "idle" });
  };

  const original = useMemo(() => data?.eventTypes.find((x) => x.id === selectedId) ?? null, [data, selectedId]);
  const dirty = JSON.stringify(original) !== JSON.stringify(draft);
  const mode = draft?.staffing?.mode ?? "seats";

  const save = async (reset = false) => {
    if (!draft) return;
    setStatus({ kind: "saving" });
    try {
      const body = reset
        ? { id: draft.id, reset: true }
        : {
            id: draft.id,
            title: draft.title,
            durationMinutes: draft.durationMinutes,
            slotStepMinutes: draft.slotStepMinutes ?? null,
            bufferMinutes: draft.bufferMinutes ?? 0,
            minNoticeMinutes: draft.minNoticeMinutes ?? 0,
            lookaheadDays: draft.lookaheadDays ?? 14,
            location: draft.location,
            weekly: draft.weekly,
            closedDates: draft.closedDates ?? [],
            holidays: draft.holidays ?? [],
            staffing: draft.staffing ?? { mode: "seats" },
          };
      const result = await call<{ eventType: AgendaEventType }>(props.endpoints.settings, { method: "PUT", body: JSON.stringify(body) });
      const next = await load();
      setDraft(next?.eventTypes.find((x) => x.id === draft.id) ?? result.eventType);
      setStatus({ kind: "saved", message: l.saved });
    } catch (e) {
      setStatus({ kind: "error", message: `${l.saveError}: ${l.errors[(e as Error).message] ?? (e as Error).message}` });
    }
  };

  if (loadError) return <p className="ags-error">{l.loadError}</p>;
  if (!data || !draft) return <p className="ags-muted">{l.loading}</p>;

  const set = (patch: Partial<AgendaEventType>) => setDraft({ ...draft, ...patch });
  const hostIds = draft.staffing?.mode === "hosts" ? draft.staffing.hostIds : [];
  const activeHosts = data.hosts.filter((h) => h.active);

  return (
    <div className={`ags ${props.className ?? ""}`.trim()}>
      {flash && (
        <p className="ags-flash" role="status">
          {flash}
          <button type="button" className="ags-icon-btn" aria-label={l.cancel} onClick={() => setFlash(null)}>
            ×
          </button>
        </p>
      )}

      {data.eventTypes.length > 1 && (
        <label className="ags-field ags-select-type">
          <span>{l.eventType}</span>
          <select value={selectedId ?? ""} onChange={(e) => select(e.target.value)}>
            {data.eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <Card title={l.sectionAppointment}>
        <div className="ags-grid">
          <label className="ags-field ags-span-2">
            <span>{l.title}</span>
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="ags-field">
            <span>
              {l.duration} ({l.minutes})
            </span>
            <input type="number" min={5} step={5} value={draft.durationMinutes} onChange={(e) => set({ durationMinutes: Number(e.target.value) || draft.durationMinutes })} />
          </label>
          <label className="ags-field">
            <span>
              {l.step} ({l.minutes})
            </span>
            <input
              type="number"
              min={5}
              step={5}
              placeholder={l.stepHint}
              value={draft.slotStepMinutes ?? ""}
              onChange={(e) => set({ slotStepMinutes: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="ags-field">
            <span>
              {l.buffer} ({l.minutes})
            </span>
            <input type="number" min={0} step={5} value={draft.bufferMinutes ?? 0} onChange={(e) => set({ bufferMinutes: Number(e.target.value) || 0 })} />
          </label>
          <label className="ags-field">
            <span>
              {l.minNotice} ({l.hours})
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={Math.round((draft.minNoticeMinutes ?? 0) / 60)}
              onChange={(e) => set({ minNoticeMinutes: (Number(e.target.value) || 0) * 60 })}
            />
          </label>
          <label className="ags-field">
            <span>
              {l.lookahead} ({l.days})
            </span>
            <input type="number" min={1} max={365} value={draft.lookaheadDays ?? 14} onChange={(e) => set({ lookaheadDays: Number(e.target.value) || 14 })} />
          </label>
          <label className="ags-field">
            <span>{l.location}</span>
            <select value={draft.location} onChange={(e) => set({ location: e.target.value as AgendaEventType["location"] })}>
              <option value="video">{l.locationVideo}</option>
              <option value="phone">{l.locationPhone}</option>
              <option value="in_person">{l.locationInPerson}</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title={l.sectionStaffing}>
        <div className="ags-choice">
          <label className={`ags-option${mode === "seats" ? " is-active" : ""}`}>
            <input type="radio" checked={mode === "seats"} onChange={() => set({ staffing: { mode: "seats" } })} />
            <span>
              <strong>{l.staffingSeats}</strong>
              <small>{l.staffingSeatsHint}</small>
            </span>
          </label>
          <label className={`ags-option${mode === "hosts" ? " is-active" : ""}`}>
            <input type="radio" checked={mode === "hosts"} onChange={() => set({ staffing: { mode: "hosts", hostIds: activeHosts.map((h) => h.id) } })} />
            <span>
              <strong>{l.staffingHosts}</strong>
              <small>{l.staffingHostsHint}</small>
            </span>
          </label>
        </div>
        {mode === "hosts" && (
          <div className="ags-checks">
            {activeHosts.length === 0 && <p className="ags-muted">{l.noHosts}</p>}
            {activeHosts.map((h) => (
              <label key={h.id}>
                <input
                  type="checkbox"
                  checked={hostIds.includes(h.id)}
                  onChange={(e) =>
                    set({ staffing: { mode: "hosts", hostIds: e.target.checked ? [...hostIds, h.id] : hostIds.filter((x) => x !== h.id) } })
                  }
                />{" "}
                {h.name}
              </label>
            ))}
          </div>
        )}
      </Card>

      <Card title={l.sectionHours} hint={mode === "seats" ? l.hoursHintSeats : l.hoursHintHosts}>
        <WindowsEditor windows={[...draft.weekly]} onChange={(weekly) => set({ weekly })} showCapacity={mode === "seats"} l={l} />
      </Card>

      <Card title={l.sectionClosures}>
        <div className="ags-checks">
          {data.holidayCalendars.map((h) => (
            <label key={h.code}>
              <input
                type="checkbox"
                checked={draft.holidays?.includes(h.code) ?? false}
                onChange={(e) =>
                  set({ holidays: e.target.checked ? [...(draft.holidays ?? []), h.code] : (draft.holidays ?? []).filter((c) => c !== h.code) })
                }
              />{" "}
              {h.label}
            </label>
          ))}
        </div>
        <p className="ags-label">{l.closedDates}</p>
        {(draft.closedDates ?? []).length === 0 && <p className="ags-muted">{l.noClosedDates}</p>}
        <ul className="ags-dates">
          {(draft.closedDates ?? []).map((d) => (
            <li key={d}>
              {new Date(`${d}T12:00:00Z`).toLocaleDateString(props.locale === "en" ? "en-GB" : "it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
              <button type="button" className="ags-icon-btn" aria-label={l.remove} onClick={() => set({ closedDates: (draft.closedDates ?? []).filter((x) => x !== d) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="ags-inline">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label={l.addDate} />
          <button
            type="button"
            className="ags-btn ags-btn-ghost"
            disabled={!newDate}
            onClick={() => {
              set({ closedDates: [...new Set([...(draft.closedDates ?? []), newDate])].sort() });
              setNewDate("");
            }}
          >
            {l.addDate}
          </button>
        </div>
      </Card>

      <div className="ags-savebar">
        <button type="button" className="ags-btn" disabled={!dirty || status.kind === "saving"} onClick={() => void save()}>
          {status.kind === "saving" ? l.saving : l.save}
        </button>
        <button type="button" className="ags-link" disabled={status.kind === "saving"} onClick={() => void save(true)}>
          {l.resetDefault}
        </button>
        {status.message && <span className={status.kind === "error" ? "ags-error" : "ags-ok"}>{status.message}</span>}
      </div>

      {(props.showTeam ?? true) && (
        <Card title={l.sectionTeam} hint={l.teamHint}>
          {data.hosts.length === 0 && <p className="ags-muted">{l.noHosts}</p>}
          <div className="ags-hosts">
            {data.hosts.map((h) => (
              <HostCard
                key={`${h.id}:${JSON.stringify(h.weekly)}`}
                host={h}
                connections={data.connections.filter((c) => c.hostId === h.id)}
                providers={data.providers}
                baseWeekly={[...draft.weekly]}
                endpoints={props.endpoints}
                returnTo={props.returnTo}
                l={l}
                onChanged={() => void load()}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
