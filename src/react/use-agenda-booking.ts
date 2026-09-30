"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AgendaSlot, LocationKind } from "../core/types.js";

export type AgendaBookingOptions = {
  /** Endpoint mounted with the `availability` handler. */
  availabilityUrl: string;
  /** Endpoint mounted with the `book` handler. */
  bookingUrl: string;
  /** Event type id. The scope's first event type when omitted. */
  eventType?: string;
};

export type AgendaEventTypeSummary = {
  id: string;
  title: string;
  durationMinutes: number;
  location: LocationKind;
};

export type AgendaBookingFields = {
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  source?: string;
  answers?: Record<string, unknown>;
  /** Anything else is forwarded to the host's `onBookingCreated` hook. */
  [extra: string]: unknown;
};

export type AgendaBookingSubmitResult =
  | { ok: true; id: string; startsAt: string; endsAt: string; location: LocationKind; guestUrl?: string }
  | { ok: false; error: string; field?: string };

function withQuery(url: string, params: Record<string, string | undefined>): string {
  const [path, existing] = url.split("?");
  const search = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function guestTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * Headless state machine for the "pick a day → pick a time → leave your
 * details" flow. It owns data and transitions; the host owns every pixel.
 */
export function useAgendaBooking(options: AgendaBookingOptions) {
  const { availabilityUrl, bookingUrl, eventType: eventTypeId } = options;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [eventType, setEventType] = useState<AgendaEventTypeSummary | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AgendaSlot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AgendaSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(withQuery(availabilityUrl, { event: eventTypeId }), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setEventType(data.eventType ?? null);
        setTimezone(data.timezone ?? null);
        setDays(Array.isArray(data.days) ? data.days : []);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityUrl, eventTypeId]);

  useEffect(() => {
    if (!selectedDate) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlots(null);
    fetch(withQuery(availabilityUrl, { event: eventTypeId, date: selectedDate }), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((data) => {
        if (!cancelled) setSlots(Array.isArray(data.slots) ? data.slots : []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityUrl, eventTypeId, selectedDate, reloadKey]);

  const selectDate = useCallback((date: string | null) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  }, []);

  const selectSlot = useCallback((slot: AgendaSlot | null) => {
    if (slot && !slot.available) return;
    setSelectedSlot(slot);
  }, []);

  const reloadSlots = useCallback(() => setReloadKey((k) => k + 1), []);

  const submit = useCallback(
    async (fields: AgendaBookingFields): Promise<AgendaBookingSubmitResult> => {
      if (!selectedSlot) return { ok: false, error: "no_slot" };
      if (submittingRef.current) return { ok: false, error: "busy" };
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch(bookingUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timezone: guestTimezone(),
            ...fields,
            eventType: eventType?.id ?? eventTypeId,
            startUtc: selectedSlot.startUtc,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          // Someone else took it: drop the choice and show fresh availability.
          setSelectedSlot(null);
          setReloadKey((k) => k + 1);
          return { ok: false, error: "slot_taken" };
        }
        if (!res.ok) return { ok: false, error: data.error ?? "failed", field: data.field };
        return {
          ok: true,
          id: data.id,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          location: data.location,
          guestUrl: data.guestUrl,
        };
      } catch {
        return { ok: false, error: "network" };
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [bookingUrl, eventType, eventTypeId, selectedSlot],
  );

  return {
    status,
    eventType,
    timezone,
    days,
    selectedDate,
    selectDate,
    slots,
    loadingSlots,
    selectedSlot,
    selectSlot,
    reloadSlots,
    submit,
    submitting,
  };
}

export type AgendaBookingState = ReturnType<typeof useAgendaBooking>;
