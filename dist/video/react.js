"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LiveKitRoom } from "@livekit/components-react";
import { DEFAULT_VIDEO_LABELS } from "./labels.js";
import { AgendaLobby } from "./lobby.js";
import { AgendaMeetRoom } from "./room.js";
export { DEFAULT_VIDEO_LABELS } from "./labels.js";
export { AgendaLobby } from "./lobby.js";
export { AgendaMeetRoom } from "./room.js";
function messageFor(e, l) {
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
function Fullscreen({ children }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);
    return mounted ? createPortal(_jsx("div", { className: "agv-fullscreen", children: children }), document.body) : null;
}
/**
 * Device check, then a Meet-style call: stage with grid / one-to-one / screen
 * share layouts, bottom bar with microphone, camera, device menus, screen
 * share and leave, people and chat panels. Import
 * `@pynkstudio/agendaapp/video/styles.css` once and theme it with the
 * `--agv-*` custom properties.
 */
export function AgendaVideoCall(props) {
    const l = { ...DEFAULT_VIDEO_LABELS, ...props.labels };
    const [phase, setPhase] = useState({ kind: "lobby" });
    const fullscreen = props.fullscreen ?? true;
    const className = `agv ${props.className ?? ""}`.trim();
    async function join(choices) {
        setPhase({ kind: "connecting" });
        try {
            const access = await props.getAccess();
            if ("error" in access)
                setPhase({ kind: "error", message: messageFor(access, l) });
            else
                setPhase({ kind: "live", access, choices });
        }
        catch {
            setPhase({ kind: "error", message: l.generic });
        }
    }
    if (phase.kind === "live") {
        const { access, choices } = phase;
        const room = (_jsx(LiveKitRoom, { serverUrl: access.serverUrl, token: access.token, connect: true, audio: choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false, video: choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false, options: {
                adaptiveStream: true,
                dynacast: true,
                audioOutput: choices.audioOutputDeviceId ? { deviceId: choices.audioOutputDeviceId } : undefined,
            }, onDisconnected: () => {
                setPhase({ kind: "left" });
                props.onLeave?.();
            }, className: className, children: _jsx(AgendaMeetRoom, { labels: l, title: props.title }) }));
        return fullscreen ? _jsx(Fullscreen, { children: room }) : room;
    }
    return (_jsxs("div", { className: className, children: [(phase.kind === "lobby" || phase.kind === "connecting") && (_jsx(AgendaLobby, { displayName: props.displayName, title: props.title, labels: l, busy: phase.kind === "connecting", onJoin: join })), (phase.kind === "left" || phase.kind === "error") && (_jsxs("div", { className: "agv-status", children: [_jsx("p", { children: phase.kind === "left" ? l.left : phase.message }), _jsx("button", { type: "button", className: "agv-join", onClick: () => setPhase({ kind: "lobby" }), children: l.rejoin })] }))] }));
}
//# sourceMappingURL=react.js.map