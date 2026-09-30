"use client";

import { useState, type FormEvent } from "react";

import { dateParts } from "../core/time.js";
import { useAgendaBooking, type AgendaBookingOptions, type AgendaBookingSubmitResult } from "./use-agenda-booking.js";

export type AgendaBookingLabels = {
  stepDate: string;
  stepTime: string;
  stepDetails: string;
  loading: string;
  unavailable: string;
  loadingSlots: string;
  noSlots: string;
  selected: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  submit: string;
  sending: string;
  errorRequired: string;
  errorEmail: string;
  errorSlotTaken: string;
  errorGeneric: string;
  weekdays: readonly string[];
  months: readonly string[];
};

export const DEFAULT_BOOKING_LABELS: AgendaBookingLabels = {
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

export type AgendaBookingWidgetProps = AgendaBookingOptions & {
  labels?: Partial<AgendaBookingLabels>;
  /** Which optional fields to show; the ones listed in `required` must be filled. */
  fields?: ReadonlyArray<"phone" | "topic">;
  required?: ReadonlyArray<"phone" | "topic">;
  /** Extra payload for the host hook (source page, attribution…). */
  extra?: Record<string, unknown>;
  onBooked?: (result: Extract<AgendaBookingSubmitResult, { ok: true }>) => void;
  className?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Unbranded default UI. Styled only through `ag-*` class names and the
 * `--ag-*` custom properties; hosts with their own identity should build on
 * `useAgendaBooking` instead.
 */
export function AgendaBookingWidget(props: AgendaBookingWidgetProps) {
  const l = { ...DEFAULT_BOOKING_LABELS, ...props.labels };
  const fields = props.fields ?? ["phone", "topic"];
  const required = new Set(props.required ?? []);
  const booking = useAgendaBooking(props);
  const [form, setForm] = useState({ name: "", email: "", phone: "", topic: "" });
  const [error, setError] = useState<string | null>(null);

  const dayLabel = (iso: string) => {
    const p = dateParts(iso);
    return `${l.weekdays[p.weekday]} ${p.day} ${l.months[p.month]}`;
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const missing = !form.name.trim() || !form.email.trim() || [...required].some((f) => !form[f].trim());
    if (missing) return setError(l.errorRequired);
    if (!EMAIL_RE.test(form.email.trim())) return setError(l.errorEmail);
    const result = await booking.submit({ ...props.extra, ...form });
    if (result.ok) props.onBooked?.(result);
    else setError(result.error === "slot_taken" ? l.errorSlotTaken : l.errorGeneric);
  }

  if (booking.status === "loading") return <p className="ag-note">{l.loading}</p>;
  if (booking.status === "error") return <p className="ag-note">{l.unavailable}</p>;

  return (
    <div className={`ag-booking ${props.className ?? ""}`.trim()}>
      <h3 className="ag-step">{l.stepDate}</h3>
      <div className="ag-days" role="listbox" aria-label={l.stepDate}>
        {booking.days.map((iso) => {
          const p = dateParts(iso);
          const active = booking.selectedDate === iso;
          return (
            <button
              key={iso}
              type="button"
              role="option"
              aria-selected={active}
              className={`ag-day${active ? " is-active" : ""}`}
              onClick={() => booking.selectDate(iso)}
            >
              <span className="ag-day-wd">{l.weekdays[p.weekday]}</span>
              <span className="ag-day-num">{p.day}</span>
              <span className="ag-day-mo">{l.months[p.month]}</span>
            </button>
          );
        })}
      </div>

      {booking.selectedDate && (
        <>
          <h3 className="ag-step">{l.stepTime}</h3>
          {booking.loadingSlots ? (
            <p className="ag-note">{l.loadingSlots}</p>
          ) : booking.slots && booking.slots.some((s) => s.available) ? (
            <div className="ag-slots">
              {booking.slots.map((s) => (
                <button
                  key={s.startUtc}
                  type="button"
                  disabled={!s.available}
                  aria-pressed={booking.selectedSlot?.startUtc === s.startUtc}
                  className={`ag-slot${booking.selectedSlot?.startUtc === s.startUtc ? " is-active" : ""}`}
                  onClick={() => booking.selectSlot(s)}
                >
                  {s.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="ag-note">{l.noSlots}</p>
          )}
        </>
      )}

      {booking.selectedSlot && booking.selectedDate && (
        <form className="ag-form" onSubmit={onSubmit} autoComplete="on">
          <h3 className="ag-step">{l.stepDetails}</h3>
          <p className="ag-note">
            {l.selected} <strong>{dayLabel(booking.selectedDate)}, {booking.selectedSlot.time}</strong>
          </p>
          <label className="ag-field">
            <span>{l.name} *</span>
            <input name="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="ag-field">
            <span>{l.email} *</span>
            <input name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          {fields.includes("phone") && (
            <label className="ag-field">
              <span>{l.phone}{required.has("phone") ? " *" : ""}</span>
              <input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          )}
          {fields.includes("topic") && (
            <label className="ag-field">
              <span>{l.topic}{required.has("topic") ? " *" : ""}</span>
              <textarea name="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </label>
          )}
          {error && <p className="ag-error" role="alert">{error}</p>}
          <button type="submit" className="ag-submit" disabled={booking.submitting}>
            {booking.submitting ? l.sending : l.submit}
          </button>
        </form>
      )}
    </div>
  );
}
