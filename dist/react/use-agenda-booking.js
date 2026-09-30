"use client";
import { useCallback, useEffect, useRef, useState } from "react";
function withQuery(url, params) {
    const [path, existing] = url.split("?");
    const search = new URLSearchParams(existing);
    for (const [k, v] of Object.entries(params))
        if (v)
            search.set(k, v);
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}
function guestTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    catch {
        return undefined;
    }
}
/**
 * Headless state machine for the "pick a day → pick a time → leave your
 * details" flow. It owns data and transitions; the host owns every pixel.
 */
export function useAgendaBooking(options) {
    const { availabilityUrl, bookingUrl, eventType: eventTypeId } = options;
    const [status, setStatus] = useState("loading");
    const [eventType, setEventType] = useState(null);
    const [timezone, setTimezone] = useState(null);
    const [days, setDays] = useState([]);
    const [selectedDate, setSelectedDate] = useState(null);
    const [slots, setSlots] = useState(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const submittingRef = useRef(false);
    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        fetch(withQuery(availabilityUrl, { event: eventTypeId }), { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((data) => {
            if (cancelled)
                return;
            setEventType(data.eventType ?? null);
            setTimezone(data.timezone ?? null);
            setDays(Array.isArray(data.days) ? data.days : []);
            setStatus("ready");
        })
            .catch(() => {
            if (!cancelled)
                setStatus("error");
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
            if (!cancelled)
                setSlots(Array.isArray(data.slots) ? data.slots : []);
        })
            .catch(() => {
            if (!cancelled)
                setSlots([]);
        })
            .finally(() => {
            if (!cancelled)
                setLoadingSlots(false);
        });
        return () => {
            cancelled = true;
        };
    }, [availabilityUrl, eventTypeId, selectedDate, reloadKey]);
    const selectDate = useCallback((date) => {
        setSelectedDate(date);
        setSelectedSlot(null);
    }, []);
    const selectSlot = useCallback((slot) => {
        if (slot && !slot.available)
            return;
        setSelectedSlot(slot);
    }, []);
    const reloadSlots = useCallback(() => setReloadKey((k) => k + 1), []);
    const submit = useCallback(async (fields) => {
        if (!selectedSlot)
            return { ok: false, error: "no_slot" };
        if (submittingRef.current)
            return { ok: false, error: "busy" };
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
            if (!res.ok)
                return { ok: false, error: data.error ?? "failed", field: data.field };
            return {
                ok: true,
                id: data.id,
                startsAt: data.startsAt,
                endsAt: data.endsAt,
                location: data.location,
                guestUrl: data.guestUrl,
            };
        }
        catch {
            return { ok: false, error: "network" };
        }
        finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }, [bookingUrl, eventType, eventTypeId, selectedSlot]);
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
//# sourceMappingURL=use-agenda-booking.js.map