export type VideoAccess = {
    serverUrl: string;
    token: string;
};
export type VideoAccessError = {
    error: string;
    /** With `too_early`: ISO instant the room opens. */
    opensAt?: string;
};
export type AgendaVideoCallLabels = {
    join: string;
    mic: string;
    camera: string;
    name: string;
    connecting: string;
    left: string;
    rejoin: string;
    tooEarly: (opensAt: Date) => string;
    ended: string;
    cancelled: string;
    forbidden: string;
    generic: string;
};
export declare const DEFAULT_VIDEO_LABELS: AgendaVideoCallLabels;
export type AgendaVideoCallProps = {
    /**
     * Asks the host's `videoToken` endpoint for access. Called when the user
     * presses Join, so the token is always fresh.
     */
    getAccess: () => Promise<VideoAccess | VideoAccessError>;
    displayName?: string;
    labels?: Partial<AgendaVideoCallLabels>;
    onLeave?: () => void;
    className?: string;
};
/**
 * Device check, then the LiveKit prefab conference. Hosts must load
 * `@livekit/components-styles` once (e.g. in the page that renders this) and
 * may theme it through its `--lk-*` custom properties.
 */
export declare function AgendaVideoCall(props: AgendaVideoCallProps): import("react").JSX.Element;
//# sourceMappingURL=react.d.ts.map