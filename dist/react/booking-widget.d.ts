import { type AgendaBookingOptions, type AgendaBookingSubmitResult } from "./use-agenda-booking.js";
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
export declare const DEFAULT_BOOKING_LABELS: AgendaBookingLabels;
export type AgendaBookingWidgetProps = AgendaBookingOptions & {
    labels?: Partial<AgendaBookingLabels>;
    /** Which optional fields to show; the ones listed in `required` must be filled. */
    fields?: ReadonlyArray<"phone" | "topic">;
    required?: ReadonlyArray<"phone" | "topic">;
    /** Extra payload for the host hook (source page, attribution…). */
    extra?: Record<string, unknown>;
    onBooked?: (result: Extract<AgendaBookingSubmitResult, {
        ok: true;
    }>) => void;
    className?: string;
};
/**
 * Unbranded default UI. Styled only through `ag-*` class names and the
 * `--ag-*` custom properties; hosts with their own identity should build on
 * `useAgendaBooking` instead.
 */
export declare function AgendaBookingWidget(props: AgendaBookingWidgetProps): import("react").JSX.Element;
//# sourceMappingURL=booking-widget.d.ts.map