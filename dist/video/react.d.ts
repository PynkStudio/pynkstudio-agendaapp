import { type AgendaVideoCallLabels } from "./labels.js";
export { DEFAULT_VIDEO_LABELS, type AgendaVideoCallLabels } from "./labels.js";
export { AgendaLobby, type LobbyChoices } from "./lobby.js";
export { AgendaMeetRoom } from "./room.js";
export type VideoAccess = {
    serverUrl: string;
    token: string;
    displayName?: string;
};
export type VideoAccessError = {
    error: string;
    /** With `too_early`: ISO instant the room opens. */
    opensAt?: string;
};
export type AgendaVideoCallProps = {
    /**
     * Asks the host's `videoToken` endpoint for access. Called when the user
     * presses Join, so the token is always fresh.
     */
    getAccess: () => Promise<VideoAccess | VideoAccessError>;
    /**
     * Name shown in the lobby. The name the others see is the one in the
     * token, set by the server: keep the two consistent (`agenda.guestDisplayName`
     * for guests, the staff member's full name for hosts).
     */
    displayName: string;
    /** Meeting title, shown in the lobby and in the bottom bar. */
    title?: string;
    labels?: Partial<AgendaVideoCallLabels>;
    onLeave?: () => void;
    /**
     * Open the call over the whole viewport, portalled to `document.body` so
     * that transformed ancestors cannot trap it. Default true.
     */
    fullscreen?: boolean;
    className?: string;
};
/**
 * Device check, then a Meet-style call: stage with grid / one-to-one / screen
 * share layouts, bottom bar with microphone, camera, device menus, screen
 * share and leave, people and chat panels. Import
 * `@pynkstudio/agendaapp/video/styles.css` once and theme it with the
 * `--agv-*` custom properties.
 */
export declare function AgendaVideoCall(props: AgendaVideoCallProps): import("react").JSX.Element;
//# sourceMappingURL=react.d.ts.map