"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { dateParts } from "../core/time.js";
import { useAgendaBooking } from "./use-agenda-booking.js";
export const DEFAULT_BOOKING_LABELS = {
    stepDate: "Pick a day",
    stepTime: "Pick a time",
    stepDetails: "Your details",
    loading: "Loading…",
    unavailable: "Booking is not available right now.",
    loadingSlots: "Loading times…",
    noSlots: "No times left on this day.",
    selected: "You picked:",
    name: "Full name",
    email: "Email",
    phone: "Phone",
    topic: "What would you like to talk about?",
    submit: "Confirm booking",
    sending: "Booking…",
    errorRequired: "Please fill in the required fields.",
    errorEmail: "Please enter a valid email address.",
    errorSlotTaken: "That time was just taken. Please pick another one.",
    errorGeneric: "Something went wrong. Please try again.",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Unbranded default UI. Styled only through `ag-*` class names and the
 * `--ag-*` custom properties; hosts with their own identity should build on
 * `useAgendaBooking` instead.
 */
export function AgendaBookingWidget(props) {
    const l = { ...DEFAULT_BOOKING_LABELS, ...props.labels };
    const fields = props.fields ?? ["phone", "topic"];
    const required = new Set(props.required ?? []);
    const booking = useAgendaBooking(props);
    const [form, setForm] = useState({ name: "", email: "", phone: "", topic: "" });
    const [error, setError] = useState(null);
    const dayLabel = (iso) => {
        const p = dateParts(iso);
        return `${l.weekdays[p.weekday]} ${p.day} ${l.months[p.month]}`;
    };
    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        const missing = !form.name.trim() || !form.email.trim() || [...required].some((f) => !form[f].trim());
        if (missing)
            return setError(l.errorRequired);
        if (!EMAIL_RE.test(form.email.trim()))
            return setError(l.errorEmail);
        const result = await booking.submit({ ...props.extra, ...form });
        if (result.ok)
            props.onBooked?.(result);
        else
            setError(result.error === "slot_taken" ? l.errorSlotTaken : l.errorGeneric);
    }
    if (booking.status === "loading")
        return _jsx("p", { className: "ag-note", children: l.loading });
    if (booking.status === "error")
        return _jsx("p", { className: "ag-note", children: l.unavailable });
    return (_jsxs("div", { className: `ag-booking ${props.className ?? ""}`.trim(), children: [_jsx("h3", { className: "ag-step", children: l.stepDate }), _jsx("div", { className: "ag-days", role: "listbox", "aria-label": l.stepDate, children: booking.days.map((iso) => {
                    const p = dateParts(iso);
                    const active = booking.selectedDate === iso;
                    return (_jsxs("button", { type: "button", role: "option", "aria-selected": active, className: `ag-day${active ? " is-active" : ""}`, onClick: () => booking.selectDate(iso), children: [_jsx("span", { className: "ag-day-wd", children: l.weekdays[p.weekday] }), _jsx("span", { className: "ag-day-num", children: p.day }), _jsx("span", { className: "ag-day-mo", children: l.months[p.month] })] }, iso));
                }) }), booking.selectedDate && (_jsxs(_Fragment, { children: [_jsx("h3", { className: "ag-step", children: l.stepTime }), booking.loadingSlots ? (_jsx("p", { className: "ag-note", children: l.loadingSlots })) : booking.slots && booking.slots.some((s) => s.available) ? (_jsx("div", { className: "ag-slots", children: booking.slots.map((s) => (_jsx("button", { type: "button", disabled: !s.available, "aria-pressed": booking.selectedSlot?.startUtc === s.startUtc, className: `ag-slot${booking.selectedSlot?.startUtc === s.startUtc ? " is-active" : ""}`, onClick: () => booking.selectSlot(s), children: s.time }, s.startUtc))) })) : (_jsx("p", { className: "ag-note", children: l.noSlots }))] })), booking.selectedSlot && booking.selectedDate && (_jsxs("form", { className: "ag-form", onSubmit: onSubmit, autoComplete: "on", children: [_jsx("h3", { className: "ag-step", children: l.stepDetails }), _jsxs("p", { className: "ag-note", children: [l.selected, " ", _jsxs("strong", { children: [dayLabel(booking.selectedDate), ", ", booking.selectedSlot.time] })] }), _jsxs("label", { className: "ag-field", children: [_jsxs("span", { children: [l.name, " *"] }), _jsx("input", { name: "name", autoComplete: "name", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) })] }), _jsxs("label", { className: "ag-field", children: [_jsxs("span", { children: [l.email, " *"] }), _jsx("input", { name: "email", type: "email", autoComplete: "email", value: form.email, onChange: (e) => setForm({ ...form, email: e.target.value }) })] }), fields.includes("phone") && (_jsxs("label", { className: "ag-field", children: [_jsxs("span", { children: [l.phone, required.has("phone") ? " *" : ""] }), _jsx("input", { name: "phone", type: "tel", autoComplete: "tel", value: form.phone, onChange: (e) => setForm({ ...form, phone: e.target.value }) })] })), fields.includes("topic") && (_jsxs("label", { className: "ag-field", children: [_jsxs("span", { children: [l.topic, required.has("topic") ? " *" : ""] }), _jsx("textarea", { name: "topic", value: form.topic, onChange: (e) => setForm({ ...form, topic: e.target.value }) })] })), error && _jsx("p", { className: "ag-error", role: "alert", children: error }), _jsx("button", { type: "submit", className: "ag-submit", disabled: booking.submitting, children: booking.submitting ? l.sending : l.submit })] }))] }));
}
//# sourceMappingURL=booking-widget.js.map