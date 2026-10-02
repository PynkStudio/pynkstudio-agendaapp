"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SETTINGS_LABELS } from "./labels.js";
export { SETTINGS_LABELS } from "./labels.js";
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
async function call(url, init) {
    const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error(typeof data.error === "string" ? data.error : String(res.status));
    return data;
}
// ─── Weekly hours editor ────────────────────────────────────────────────────
function WindowsEditor({ windows, onChange, showCapacity, l, }) {
    const update = (index, patch) => onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
    return (_jsx("div", { className: "ags-week", children: WEEK_ORDER.map((day) => {
            const items = windows.map((w, index) => ({ w, index })).filter((x) => x.w.day === day);
            return (_jsxs("div", { className: "ags-day", children: [_jsx("span", { className: "ags-day-name", children: l.weekdays[day] }), _jsxs("div", { className: "ags-day-windows", children: [items.length === 0 && _jsx("span", { className: "ags-muted", children: l.closed }), items.map(({ w, index }) => (_jsxs("div", { className: "ags-window", children: [_jsxs("label", { children: [_jsx("span", { className: "ags-sr", children: l.from }), _jsx("input", { type: "time", step: 300, value: w.start, onChange: (e) => update(index, { start: e.target.value }) })] }), _jsx("span", { "aria-hidden": true, children: "\u2013" }), _jsxs("label", { children: [_jsx("span", { className: "ags-sr", children: l.to }), _jsx("input", { type: "time", step: 300, value: w.end, onChange: (e) => update(index, { end: e.target.value }) })] }), showCapacity && (_jsxs("label", { className: "ags-capacity", children: [_jsx("span", { children: l.places }), _jsx("input", { type: "number", min: 1, max: 50, value: w.capacity ?? 1, onChange: (e) => update(index, { capacity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }) })] })), _jsx("button", { type: "button", className: "ags-icon-btn", "aria-label": l.remove, title: l.remove, onClick: () => onChange(windows.filter((_, i) => i !== index)), children: "\u00D7" })] }, index)))] }), _jsxs("button", { type: "button", className: "ags-link", onClick: () => {
                            const last = items.at(-1)?.w;
                            onChange([...windows, { day, start: last ? last.end : "09:00", end: last ? "18:00" : "13:00" }]);
                        }, children: ["+ ", l.addWindow] })] }, day));
        }) }));
}
function Card({ title, hint, children }) {
    return (_jsxs("section", { className: "ags-card", children: [_jsx("h3", { className: "ags-card-title", children: title }), hint && _jsx("p", { className: "ags-hint", children: hint }), children] }));
}
// ─── Destination calendar ───────────────────────────────────────────────────
function WriteTarget({ host, connections, endpoints, l, onChanged, }) {
    const writable = connections.filter((c) => c.provider !== "ics");
    const current = host.writeTarget ?? null;
    const [connectionId, setConnectionId] = useState(current?.connectionId ?? "");
    const [calendarId, setCalendarId] = useState(current?.calendarId ?? "");
    const [options, setOptions] = useState(null);
    const [state, setState] = useState({ busy: false });
    // Labels are rebuilt on every render of the panel: read them through a ref
    // so the calendar list is fetched only when the connection changes.
    const labels = useRef(l);
    labels.current = l;
    useEffect(() => {
        const l = labels.current;
        if (!connectionId) {
            setOptions(null);
            return;
        }
        let cancelled = false;
        setOptions(null);
        setState({ busy: true, message: l.writeLoading });
        call(`${endpoints.calendars}${endpoints.calendars.includes("?") ? "&" : "?"}connectionId=${encodeURIComponent(connectionId)}`)
            .then((data) => {
            if (cancelled)
                return;
            setOptions(data.calendars);
            setState({ busy: false });
            setCalendarId((prev) => (data.calendars.some((c) => c.id === prev) ? prev : (data.calendars.find((c) => c.primary) ?? data.calendars[0])?.id ?? ""));
        })
            .catch((e) => {
            if (!cancelled)
                setState({ busy: false, error: true, message: `${l.connectFailed}: ${l.errors[e.message] ?? e.message}` });
        });
        return () => {
            cancelled = true;
        };
    }, [connectionId, endpoints.calendars]);
    const save = async () => {
        setState({ busy: true });
        try {
            const name = options?.find((c) => c.id === calendarId)?.name ?? null;
            await call(endpoints.host, {
                method: "PATCH",
                body: JSON.stringify({ hostId: host.id, writeTarget: connectionId && calendarId ? { connectionId, calendarId, calendarName: name } : null }),
            });
            setState({ busy: false, message: l.writeSaved });
            onChanged();
        }
        catch (e) {
            setState({ busy: false, error: true, message: `${l.saveError}: ${l.errors[e.message] ?? e.message}` });
        }
    };
    const changed = (current?.connectionId ?? "") !== connectionId || (connectionId && (current?.calendarId ?? "") !== calendarId);
    return (_jsxs("div", { className: "ags-host-block", children: [_jsx("p", { className: "ags-label", children: l.writeTitle }), _jsx("p", { className: "ags-hint", children: writable.length ? l.writeHint : l.writeNoWritable }), writable.length > 0 && (_jsxs("div", { className: "ags-inline ags-write", children: [_jsxs("select", { value: connectionId, onChange: (e) => setConnectionId(e.target.value), "aria-label": l.calendars, children: [_jsx("option", { value: "", children: l.writeOff }), writable.map((c) => (_jsxs("option", { value: c.id, children: [l.providerNames[c.provider], " \u00B7 ", c.account ?? "—"] }, c.id)))] }), connectionId && options && (_jsx("select", { value: calendarId, onChange: (e) => setCalendarId(e.target.value), "aria-label": l.writeTitle, children: options.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id))) })), changed && (_jsx("button", { type: "button", className: "ags-btn", disabled: state.busy || Boolean(connectionId && !calendarId), onClick: () => void save(), children: l.writeSave }))] })), state.message && _jsx("p", { className: state.error ? "ags-error" : "ags-muted ags-small", children: state.message })] }));
}
// ─── Team member ────────────────────────────────────────────────────────────
function HostCard({ host, connections, providers, baseWeekly, endpoints, returnTo, l, onChanged, }) {
    const saved = host.weekly ?? null;
    const [custom, setCustom] = useState(saved);
    const [form, setForm] = useState(null);
    const [fields, setFields] = useState({ username: "", password: "", server: "", url: "", label: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const patch = async (body) => {
        setBusy(true);
        setError(null);
        try {
            await call(endpoints.host, { method: "PATCH", body: JSON.stringify({ hostId: host.id, ...body }) });
            onChanged();
        }
        catch (e) {
            setError(`${l.saveError}: ${l.errors[e.message] ?? e.message}`);
        }
        finally {
            setBusy(false);
        }
    };
    const connect = async () => {
        setBusy(true);
        setError(null);
        try {
            const body = form === "caldav"
                ? { hostId: host.id, provider: "caldav", username: fields.username, password: fields.password, server: fields.server }
                : { hostId: host.id, provider: "ics", url: fields.url, label: fields.label };
            await call(endpoints.calendars, { method: "POST", body: JSON.stringify(body) });
            setForm(null);
            setFields({ username: "", password: "", server: "", url: "", label: "" });
            onChanged();
        }
        catch (e) {
            setError(`${l.connectFailed}: ${l.errors[e.message] ?? e.message}`);
        }
        finally {
            setBusy(false);
        }
    };
    const oauthHref = (provider) => `${endpoints.oauthStart}${endpoints.oauthStart.includes("?") ? "&" : "?"}${new URLSearchParams({ provider, hostId: host.id, returnTo })}`;
    return (_jsxs("article", { className: `ags-host${host.active ? "" : " is-inactive"}`, children: [_jsxs("header", { className: "ags-host-head", children: [_jsxs("div", { children: [_jsx("strong", { children: host.name }), host.email && _jsxs("span", { className: "ags-muted", children: [" \u00B7 ", host.email] })] }), _jsxs("label", { className: "ags-switch", children: [_jsx("input", { type: "checkbox", checked: host.active, disabled: busy, onChange: (e) => void patch({ active: e.target.checked }) }), _jsx("span", { children: host.active ? l.active : l.inactive })] })] }), _jsxs("div", { className: "ags-host-block", children: [_jsx("p", { className: "ags-label", children: l.calendars }), connections.length === 0 && _jsx("p", { className: "ags-muted", children: l.noCalendars }), _jsx("ul", { className: "ags-connections", children: connections.map((c) => (_jsxs("li", { children: [_jsx("span", { className: `ags-badge ags-badge-${c.status}`, children: c.status === "ok" ? l.statusOk : l.statusError }), _jsxs("span", { className: "ags-conn-name", children: [l.providerNames[c.provider], " \u00B7 ", c.account ?? "—"] }), c.status === "error" && c.lastError && _jsx("span", { className: "ags-conn-error", children: c.lastError }), c.lastSyncedAt && (_jsxs("span", { className: "ags-muted ags-small", children: [l.lastSync, ": ", new Date(c.lastSyncedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })] })), _jsx("button", { type: "button", className: "ags-link ags-danger", disabled: busy, onClick: async () => {
                                        setBusy(true);
                                        try {
                                            await call(endpoints.calendars, { method: "DELETE", body: JSON.stringify({ id: c.id }) });
                                            onChanged();
                                        }
                                        finally {
                                            setBusy(false);
                                        }
                                    }, children: l.disconnect })] }, c.id))) }), _jsxs("div", { className: "ags-connect", children: [["google", "microsoft"].map((p) => providers[p] ? (_jsx("a", { className: "ags-btn ags-btn-ghost", href: oauthHref(p), children: p === "google" ? l.connectGoogle : l.connectMicrosoft }, p)) : (_jsx("span", { className: "ags-btn ags-btn-ghost is-disabled", title: l.notConfigured, "aria-disabled": true, children: p === "google" ? l.connectGoogle : l.connectMicrosoft }, p))), _jsx("button", { type: "button", className: "ags-btn ags-btn-ghost", disabled: !providers.caldav, title: providers.caldav ? undefined : l.notConfigured, onClick: () => setForm(form === "caldav" ? null : "caldav"), children: l.connectApple }), _jsx("button", { type: "button", className: "ags-btn ags-btn-ghost", disabled: !providers.ics, title: providers.ics ? undefined : l.notConfigured, onClick: () => setForm(form === "ics" ? null : "ics"), children: l.connectIcs })] }), form && (_jsxs("form", { className: "ags-inline-form", onSubmit: (e) => {
                            e.preventDefault();
                            void connect();
                        }, children: [form === "caldav" ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "ags-hint", children: l.appleHelp }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.appleId }), _jsx("input", { type: "email", autoComplete: "off", value: fields.username, onChange: (e) => setFields({ ...fields, username: e.target.value }), required: true })] }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.applePassword }), _jsx("input", { type: "password", autoComplete: "new-password", value: fields.password, onChange: (e) => setFields({ ...fields, password: e.target.value }), required: true })] }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.caldavServer }), _jsx("input", { type: "url", placeholder: "https://caldav.icloud.com", value: fields.server, onChange: (e) => setFields({ ...fields, server: e.target.value }) })] })] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "ags-hint", children: l.icsHelp }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.icsUrl }), _jsx("input", { type: "url", inputMode: "url", placeholder: "https://\u2026/basic.ics", value: fields.url, onChange: (e) => setFields({ ...fields, url: e.target.value }), required: true })] }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.icsLabel }), _jsx("input", { value: fields.label, onChange: (e) => setFields({ ...fields, label: e.target.value }) })] })] })), _jsxs("div", { className: "ags-actions", children: [_jsx("button", { type: "submit", className: "ags-btn", disabled: busy, children: busy ? l.connecting : l.connect }), _jsx("button", { type: "button", className: "ags-btn ags-btn-ghost", onClick: () => setForm(null), children: l.cancel })] })] }))] }), _jsx(WriteTarget, { host: host, connections: connections, endpoints: endpoints, l: l, onChanged: onChanged }, `${connections.map((c) => c.id).join(",")}:${host.writeTarget?.connectionId ?? ""}:${host.writeTarget?.calendarId ?? ""}`), _jsxs("div", { className: "ags-host-block", children: [_jsx("p", { className: "ags-label", children: l.personalHours }), _jsxs("div", { className: "ags-radios", children: [_jsxs("label", { children: [_jsx("input", { type: "radio", checked: custom === null, onChange: () => setCustom(null) }), " ", l.sameHours] }), _jsxs("label", { children: [_jsx("input", { type: "radio", checked: custom !== null, onChange: () => setCustom(saved ?? baseWeekly.map(({ capacity: _c, ...w }) => w)) }), " ", l.customHours] })] }), custom && _jsx(WindowsEditor, { windows: custom, onChange: setCustom, showCapacity: false, l: l }), JSON.stringify(custom) !== JSON.stringify(saved) && (_jsx("button", { type: "button", className: "ags-btn", disabled: busy, onClick: () => void patch({ weekly: custom }), children: l.saveHours }))] }), error && _jsx("p", { className: "ags-error", role: "alert", children: error })] }));
}
// ─── Panel ──────────────────────────────────────────────────────────────────
/**
 * Settings page for agenda owners: hours and days, simultaneous places,
 * holidays and closed days, who takes bookings, and each team member's
 * personal hours and connected calendars.
 */
export function AgendaSettingsPanel(props) {
    const l = { ...SETTINGS_LABELS[props.locale ?? "it"], ...props.labels };
    const [data, setData] = useState(null);
    const [loadError, setLoadError] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [status, setStatus] = useState({ kind: "idle" });
    const [newDate, setNewDate] = useState("");
    const [flash, setFlash] = useState(null);
    const load = useCallback(async () => {
        try {
            const next = await call(props.endpoints.settings);
            setData(next);
            setLoadError(false);
            return next;
        }
        catch {
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
    const select = (id) => {
        const et = data?.eventTypes.find((x) => x.id === id) ?? null;
        setSelectedId(id);
        setDraft(et);
        setStatus({ kind: "idle" });
    };
    const original = useMemo(() => data?.eventTypes.find((x) => x.id === selectedId) ?? null, [data, selectedId]);
    const dirty = JSON.stringify(original) !== JSON.stringify(draft);
    const mode = draft?.staffing?.mode ?? "seats";
    const save = async (reset = false) => {
        if (!draft)
            return;
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
            const result = await call(props.endpoints.settings, { method: "PUT", body: JSON.stringify(body) });
            const next = await load();
            setDraft(next?.eventTypes.find((x) => x.id === draft.id) ?? result.eventType);
            setStatus({ kind: "saved", message: l.saved });
        }
        catch (e) {
            setStatus({ kind: "error", message: `${l.saveError}: ${l.errors[e.message] ?? e.message}` });
        }
    };
    if (loadError)
        return _jsx("p", { className: "ags-error", children: l.loadError });
    if (!data || !draft)
        return _jsx("p", { className: "ags-muted", children: l.loading });
    const set = (patch) => setDraft({ ...draft, ...patch });
    const hostIds = draft.staffing?.mode === "hosts" ? draft.staffing.hostIds : [];
    const activeHosts = data.hosts.filter((h) => h.active);
    return (_jsxs("div", { className: `ags ${props.className ?? ""}`.trim(), children: [flash && (_jsxs("p", { className: "ags-flash", role: "status", children: [flash, _jsx("button", { type: "button", className: "ags-icon-btn", "aria-label": l.cancel, onClick: () => setFlash(null), children: "\u00D7" })] })), data.eventTypes.length > 1 && (_jsxs("label", { className: "ags-field ags-select-type", children: [_jsx("span", { children: l.eventType }), _jsx("select", { value: selectedId ?? "", onChange: (e) => select(e.target.value), children: data.eventTypes.map((et) => (_jsx("option", { value: et.id, children: et.title }, et.id))) })] })), _jsx(Card, { title: l.sectionAppointment, children: _jsxs("div", { className: "ags-grid", children: [_jsxs("label", { className: "ags-field ags-span-2", children: [_jsx("span", { children: l.title }), _jsx("input", { value: draft.title, onChange: (e) => set({ title: e.target.value }) })] }), _jsxs("label", { className: "ags-field", children: [_jsxs("span", { children: [l.duration, " (", l.minutes, ")"] }), _jsx("input", { type: "number", min: 5, step: 5, value: draft.durationMinutes, onChange: (e) => set({ durationMinutes: Number(e.target.value) || draft.durationMinutes }) })] }), _jsxs("label", { className: "ags-field", children: [_jsxs("span", { children: [l.step, " (", l.minutes, ")"] }), _jsx("input", { type: "number", min: 5, step: 5, placeholder: l.stepHint, value: draft.slotStepMinutes ?? "", onChange: (e) => set({ slotStepMinutes: e.target.value ? Number(e.target.value) : undefined }) })] }), _jsxs("label", { className: "ags-field", children: [_jsxs("span", { children: [l.buffer, " (", l.minutes, ")"] }), _jsx("input", { type: "number", min: 0, step: 5, value: draft.bufferMinutes ?? 0, onChange: (e) => set({ bufferMinutes: Number(e.target.value) || 0 }) })] }), _jsxs("label", { className: "ags-field", children: [_jsxs("span", { children: [l.minNotice, " (", l.hours, ")"] }), _jsx("input", { type: "number", min: 0, step: 1, value: Math.round((draft.minNoticeMinutes ?? 0) / 60), onChange: (e) => set({ minNoticeMinutes: (Number(e.target.value) || 0) * 60 }) })] }), _jsxs("label", { className: "ags-field", children: [_jsxs("span", { children: [l.lookahead, " (", l.days, ")"] }), _jsx("input", { type: "number", min: 1, max: 365, value: draft.lookaheadDays ?? 14, onChange: (e) => set({ lookaheadDays: Number(e.target.value) || 14 }) })] }), _jsxs("label", { className: "ags-field", children: [_jsx("span", { children: l.location }), _jsxs("select", { value: draft.location, onChange: (e) => set({ location: e.target.value }), children: [_jsx("option", { value: "video", children: l.locationVideo }), _jsx("option", { value: "phone", children: l.locationPhone }), _jsx("option", { value: "in_person", children: l.locationInPerson })] })] })] }) }), _jsxs(Card, { title: l.sectionStaffing, children: [_jsxs("div", { className: "ags-choice", children: [_jsxs("label", { className: `ags-option${mode === "seats" ? " is-active" : ""}`, children: [_jsx("input", { type: "radio", checked: mode === "seats", onChange: () => set({ staffing: { mode: "seats" } }) }), _jsxs("span", { children: [_jsx("strong", { children: l.staffingSeats }), _jsx("small", { children: l.staffingSeatsHint })] })] }), _jsxs("label", { className: `ags-option${mode === "hosts" ? " is-active" : ""}`, children: [_jsx("input", { type: "radio", checked: mode === "hosts", onChange: () => set({ staffing: { mode: "hosts", hostIds: activeHosts.map((h) => h.id) } }) }), _jsxs("span", { children: [_jsx("strong", { children: l.staffingHosts }), _jsx("small", { children: l.staffingHostsHint })] })] })] }), mode === "hosts" && (_jsxs("div", { className: "ags-checks", children: [activeHosts.length === 0 && _jsx("p", { className: "ags-muted", children: l.noHosts }), activeHosts.map((h) => (_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: hostIds.includes(h.id), onChange: (e) => set({ staffing: { mode: "hosts", hostIds: e.target.checked ? [...hostIds, h.id] : hostIds.filter((x) => x !== h.id) } }) }), " ", h.name] }, h.id)))] }))] }), _jsx(Card, { title: l.sectionHours, hint: mode === "seats" ? l.hoursHintSeats : l.hoursHintHosts, children: _jsx(WindowsEditor, { windows: [...draft.weekly], onChange: (weekly) => set({ weekly }), showCapacity: mode === "seats", l: l }) }), _jsxs(Card, { title: l.sectionClosures, children: [_jsx("div", { className: "ags-checks", children: data.holidayCalendars.map((h) => (_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: draft.holidays?.includes(h.code) ?? false, onChange: (e) => set({ holidays: e.target.checked ? [...(draft.holidays ?? []), h.code] : (draft.holidays ?? []).filter((c) => c !== h.code) }) }), " ", h.label] }, h.code))) }), _jsx("p", { className: "ags-label", children: l.closedDates }), (draft.closedDates ?? []).length === 0 && _jsx("p", { className: "ags-muted", children: l.noClosedDates }), _jsx("ul", { className: "ags-dates", children: (draft.closedDates ?? []).map((d) => (_jsxs("li", { children: [new Date(`${d}T12:00:00Z`).toLocaleDateString(props.locale === "en" ? "en-GB" : "it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric" }), _jsx("button", { type: "button", className: "ags-icon-btn", "aria-label": l.remove, onClick: () => set({ closedDates: (draft.closedDates ?? []).filter((x) => x !== d) }), children: "\u00D7" })] }, d))) }), _jsxs("div", { className: "ags-inline", children: [_jsx("input", { type: "date", value: newDate, onChange: (e) => setNewDate(e.target.value), "aria-label": l.addDate }), _jsx("button", { type: "button", className: "ags-btn ags-btn-ghost", disabled: !newDate, onClick: () => {
                                    set({ closedDates: [...new Set([...(draft.closedDates ?? []), newDate])].sort() });
                                    setNewDate("");
                                }, children: l.addDate })] })] }), _jsxs("div", { className: "ags-savebar", children: [_jsx("button", { type: "button", className: "ags-btn", disabled: !dirty || status.kind === "saving", onClick: () => void save(), children: status.kind === "saving" ? l.saving : l.save }), _jsx("button", { type: "button", className: "ags-link", disabled: status.kind === "saving", onClick: () => void save(true), children: l.resetDefault }), status.message && _jsx("span", { className: status.kind === "error" ? "ags-error" : "ags-ok", children: status.message })] }), (props.showTeam ?? true) && (_jsxs(Card, { title: l.sectionTeam, hint: l.teamHint, children: [data.hosts.length === 0 && _jsx("p", { className: "ags-muted", children: l.noHosts }), _jsx("div", { className: "ags-hosts", children: data.hosts.map((h) => (_jsx(HostCard, { host: h, connections: data.connections.filter((c) => c.hostId === h.id), providers: data.providers, baseWeekly: [...draft.weekly], endpoints: props.endpoints, returnTo: props.returnTo, l: l, onChanged: () => void load() }, `${h.id}:${JSON.stringify(h.weekly)}`))) })] }))] }));
}
//# sourceMappingURL=react.js.map