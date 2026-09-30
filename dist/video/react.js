"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { LiveKitRoom, PreJoin, VideoConference } from "@livekit/components-react";
export const DEFAULT_VIDEO_LABELS = {
    join: "Join call",
    mic: "Microphone",
    camera: "Camera",
    name: "Name",
    connecting: "Connecting…",
    left: "You left the call.",
    rejoin: "Join again",
    tooEarly: (opensAt) => `The room opens at ${opensAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`,
    ended: "This call has ended.",
    cancelled: "This appointment was cancelled.",
    forbidden: "This link is not valid.",
    generic: "Could not join the call. Please try again.",
};
/**
 * Device check, then the LiveKit prefab conference. Hosts must load
 * `@livekit/components-styles` once (e.g. in the page that renders this) and
 * may theme it through its `--lk-*` custom properties.
 */
export function AgendaVideoCall(props) {
    const l = { ...DEFAULT_VIDEO_LABELS, ...props.labels };
    const [phase, setPhase] = useState({ kind: "prejoin" });
    const { getAccess, onLeave } = props;
    function messageFor(e) {
        switch (e.error) {
            case "too_early":
                return e.opensAt ? l.tooEarly(new Date(e.opensAt)) : l.generic;
            case "ended":
                return l.ended;
            case "cancelled":
                return l.cancelled;
            case "forbidden":
            case "not_found":
                return l.forbidden;
            default:
                return l.generic;
        }
    }
    async function join(choices) {
        setPhase({ kind: "connecting" });
        try {
            const access = await getAccess();
            if ("error" in access)
                setPhase({ kind: "error", message: messageFor(access) });
            else
                setPhase({ kind: "live", access, choices });
        }
        catch {
            setPhase({ kind: "error", message: l.generic });
        }
    }
    const className = `ag-video ${props.className ?? ""}`.trim();
    if (phase.kind === "live") {
        return (_jsx("div", { className: className, "data-lk-theme": "default", children: _jsx(LiveKitRoom, { serverUrl: phase.access.serverUrl, token: phase.access.token, connect: true, video: phase.choices.videoEnabled ? { deviceId: phase.choices.videoDeviceId } : false, audio: phase.choices.audioEnabled ? { deviceId: phase.choices.audioDeviceId } : false, onDisconnected: () => {
                    setPhase({ kind: "left" });
                    onLeave?.();
                }, style: { height: "100%" }, children: _jsx(VideoConference, {}) }) }));
    }
    return (_jsxs("div", { className: className, "data-lk-theme": "default", children: [phase.kind === "prejoin" && (_jsx(PreJoin, { defaults: { username: props.displayName ?? "" }, onSubmit: join, joinLabel: l.join, micLabel: l.mic, camLabel: l.camera, userLabel: l.name, persistUserChoices: false })), phase.kind === "connecting" && _jsx("p", { className: "ag-note", children: l.connecting }), (phase.kind === "left" || phase.kind === "error") && (_jsxs("div", { className: "ag-video-status", children: [_jsx("p", { className: "ag-note", children: phase.kind === "left" ? l.left : phase.message }), _jsx("button", { type: "button", className: "ag-submit", onClick: () => setPhase({ kind: "prejoin" }), children: l.rejoin })] }))] }));
}
//# sourceMappingURL=react.js.map