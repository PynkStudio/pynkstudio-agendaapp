"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useChat, useConnectionState, useIsMuted, useIsSpeaking, useLocalParticipant, useMediaDeviceSelect, useParticipants, useRoomContext, useTrackToggle, useTracks, } from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { Avatar } from "./avatar.js";
import { CamIcon, CamOffIcon, ChatIcon, CheckIcon, ChevronUpIcon, CloseIcon, LeaveIcon, MicIcon, MicOffIcon, PeopleIcon, ScreenIcon, SendIcon, } from "./icons.js";
function nameOf(p) {
    return p.name || p.identity;
}
// ─── Tiles ──────────────────────────────────────────────────────────────────
function Tile({ trackRef, labels, variant = "grid" }) {
    const p = trackRef.participant;
    const speaking = useIsSpeaking(p);
    const camMuted = useIsMuted(trackRef);
    const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone });
    const showVideo = isTrackReference(trackRef) && !camMuted;
    const name = p.isLocal ? `${nameOf(p)} (${labels.you})` : nameOf(p);
    return (_jsxs("div", { className: `agv-tile agv-tile-${variant}${speaking && !micMuted ? " is-speaking" : ""}`, children: [showVideo ? (_jsx(VideoTrack, { trackRef: trackRef, className: p.isLocal ? "agv-mirror" : undefined })) : (_jsx("div", { className: "agv-tile-avatar", children: _jsx(Avatar, { name: nameOf(p), size: variant === "grid" ? "lg" : "md" }) })), _jsxs("span", { className: "agv-tile-name", children: [micMuted && _jsx(MicOffIcon, { className: "agv-tile-muted" }), name] })] }));
}
function ScreenTile({ trackRef, labels }) {
    if (!isTrackReference(trackRef))
        return null;
    return (_jsxs("div", { className: "agv-screen", children: [_jsx(VideoTrack, { trackRef: trackRef }), _jsx("span", { className: "agv-tile-name", children: labels.presenting(nameOf(trackRef.participant)) })] }));
}
function Stage({ labels }) {
    const tracks = useTracks([
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
    ], { onlySubscribed: false });
    const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
    const cams = tracks.filter((t) => t.source === Track.Source.Camera);
    if (screens.length > 0) {
        return (_jsxs("div", { className: "agv-stage agv-stage-present", children: [_jsx(ScreenTile, { trackRef: screens[0], labels: labels }), _jsx("div", { className: "agv-strip", children: cams.map((t) => (_jsx(Tile, { trackRef: t, labels: labels, variant: "strip" }, t.participant.identity))) })] }));
    }
    if (cams.length === 1) {
        return (_jsxs("div", { className: "agv-stage agv-stage-alone", children: [_jsx(Tile, { trackRef: cams[0], labels: labels }), _jsx("p", { className: "agv-waiting", children: labels.waitingAlone })] }));
    }
    // 1:1 like a phone call: the other person fills the stage, you float in a corner.
    if (cams.length === 2) {
        const remote = cams.find((t) => !t.participant.isLocal) ?? cams[0];
        const local = cams.find((t) => t.participant.isLocal) ?? cams[1];
        return (_jsxs("div", { className: "agv-stage agv-stage-duo", children: [_jsx(Tile, { trackRef: remote, labels: labels }), _jsx(Tile, { trackRef: local, labels: labels, variant: "pip" })] }));
    }
    const cols = Math.ceil(Math.sqrt(cams.length));
    return (_jsx("div", { className: "agv-stage agv-stage-grid", style: { ["--agv-cols"]: String(cols) }, children: cams.map((t) => (_jsx(Tile, { trackRef: t, labels: labels }, t.participant.identity))) }));
}
// ─── Controls ───────────────────────────────────────────────────────────────
function useClickOutside(ref, onOutside, active) {
    useEffect(() => {
        if (!active)
            return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                onOutside();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [ref, onOutside, active]);
}
function DeviceList({ kind, title, empty }) {
    const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, requestPermissions: false });
    if (devices.length === 0) {
        return empty ? (_jsxs("div", { className: "agv-menu-group", children: [_jsx("p", { className: "agv-menu-title", children: title }), _jsx("p", { className: "agv-menu-empty", children: empty })] })) : null;
    }
    return (_jsxs("div", { className: "agv-menu-group", children: [_jsx("p", { className: "agv-menu-title", children: title }), devices.map((d, i) => {
                // "default" or an unknown id means the browser's first device is in use.
                const known = devices.some((x) => x.deviceId === activeDeviceId);
                const active = known ? d.deviceId === activeDeviceId : i === 0;
                return (_jsxs("button", { type: "button", className: "agv-menu-item", onClick: () => void setActiveMediaDevice(d.deviceId), children: [_jsx("span", { className: "agv-menu-check", children: active && _jsx(CheckIcon, {}) }), d.label || `${title} ${i + 1}`] }, d.deviceId || i));
            })] }));
}
function ToggleWithMenu({ source, onLabel, offLabel, OnIcon, OffIcon, menu, menuLabel, onDeviceError, }) {
    const { toggle, enabled, pending } = useTrackToggle({ source, onDeviceError });
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useClickOutside(box, () => setOpen(false), open);
    const label = enabled ? onLabel : offLabel;
    return (_jsxs("div", { className: `agv-split${enabled ? "" : " is-off"}`, ref: box, children: [_jsx("button", { type: "button", className: "agv-split-menu", "aria-label": menuLabel, title: menuLabel, "aria-expanded": open, onClick: () => setOpen((o) => !o), children: _jsx(ChevronUpIcon, {}) }), _jsx("button", { type: "button", className: "agv-split-main", "aria-label": label, title: label, "aria-pressed": !enabled, disabled: pending, onClick: () => void toggle(), children: enabled ? _jsx(OnIcon, {}) : _jsx(OffIcon, {}) }), open && _jsx("div", { className: "agv-menu", role: "menu", children: menu })] }));
}
function ScreenShareButton({ labels }) {
    const { toggle, enabled, pending } = useTrackToggle({ source: Track.Source.ScreenShare });
    const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
    if (!supported)
        return null;
    const label = enabled ? labels.stopSharing : labels.shareScreen;
    return (_jsx("button", { type: "button", className: `agv-round${enabled ? " is-active" : ""}`, "aria-label": label, title: label, "aria-pressed": enabled, disabled: pending, onClick: () => void toggle(), children: _jsx(ScreenIcon, {}) }));
}
function Clock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 15000);
        return () => clearInterval(id);
    }, []);
    return _jsx("span", { className: "agv-clock", children: now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) });
}
function ControlBar({ labels, title, panel, setPanel, participantCount, unread, onDeviceError, }) {
    const room = useRoomContext();
    return (_jsxs("div", { className: "agv-bar", children: [_jsxs("div", { className: "agv-bar-left", children: [_jsx(Clock, {}), title && _jsx("span", { className: "agv-bar-title", children: title })] }), _jsxs("div", { className: "agv-bar-center", children: [_jsx(ToggleWithMenu, { source: Track.Source.Microphone, onLabel: labels.micOn, offLabel: labels.micOff, OnIcon: MicIcon, OffIcon: MicOffIcon, menuLabel: labels.deviceSettings, onDeviceError: onDeviceError, menu: _jsxs(_Fragment, { children: [_jsx(DeviceList, { kind: "audioinput", title: labels.microphone, empty: labels.noDevices }), _jsx(DeviceList, { kind: "audiooutput", title: labels.speaker })] }) }), _jsx(ToggleWithMenu, { source: Track.Source.Camera, onLabel: labels.cameraOn, offLabel: labels.cameraOff, OnIcon: CamIcon, OffIcon: CamOffIcon, menuLabel: labels.deviceSettings, onDeviceError: onDeviceError, menu: _jsx(DeviceList, { kind: "videoinput", title: labels.camera, empty: labels.noDevices }) }), _jsx(ScreenShareButton, { labels: labels }), _jsx("button", { type: "button", className: "agv-leave", "aria-label": labels.leave, title: labels.leave, onClick: () => void room.disconnect(), children: _jsx(LeaveIcon, {}) })] }), _jsxs("div", { className: "agv-bar-right", children: [_jsxs("button", { type: "button", className: `agv-icon-btn${panel === "people" ? " is-active" : ""}`, "aria-label": labels.people, title: labels.people, "aria-pressed": panel === "people", onClick: () => setPanel(panel === "people" ? null : "people"), children: [_jsx(PeopleIcon, {}), _jsx("span", { className: "agv-badge agv-badge-count", children: participantCount })] }), _jsxs("button", { type: "button", className: `agv-icon-btn${panel === "chat" ? " is-active" : ""}`, "aria-label": labels.chat, title: labels.chat, "aria-pressed": panel === "chat", onClick: () => setPanel(panel === "chat" ? null : "chat"), children: [_jsx(ChatIcon, {}), unread > 0 && _jsx("span", { className: "agv-badge", children: unread })] })] })] }));
}
// ─── Side panels ────────────────────────────────────────────────────────────
function PersonRow({ participant, labels }) {
    const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
    return (_jsxs("li", { className: "agv-person", children: [_jsx(Avatar, { name: nameOf(participant), size: "sm" }), _jsxs("span", { className: "agv-person-name", children: [nameOf(participant), participant.isLocal && _jsxs("em", { children: [" (", labels.you, ")"] })] }), micMuted ? _jsx(MicOffIcon, { className: "agv-person-mic is-off" }) : _jsx(MicIcon, { className: "agv-person-mic" })] }));
}
function ChatPanel({ labels, chat }) {
    const [draft, setDraft] = useState("");
    const list = useRef(null);
    useEffect(() => {
        list.current?.scrollTo({ top: list.current.scrollHeight });
    }, [chat.chatMessages.length]);
    const submit = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text)
            return;
        setDraft("");
        await chat.send(text);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "agv-chat-list", ref: list, children: [chat.chatMessages.length === 0 && _jsx("p", { className: "agv-chat-empty", children: labels.noMessages }), chat.chatMessages.map((m) => (_jsxs("div", { className: "agv-chat-msg", children: [_jsxs("p", { className: "agv-chat-meta", children: [_jsx("strong", { children: m.from ? (m.from.isLocal ? labels.you : nameOf(m.from)) : "—" }), _jsx("span", { children: new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })] }), _jsx("p", { className: "agv-chat-text", children: m.message })] }, m.id)))] }), _jsxs("form", { className: "agv-chat-form", onSubmit: submit, children: [_jsx("input", { value: draft, onChange: (e) => setDraft(e.target.value), placeholder: labels.chatPlaceholder, "aria-label": labels.chatPlaceholder }), _jsx("button", { type: "submit", "aria-label": labels.send, title: labels.send, disabled: chat.isSending || !draft.trim(), children: _jsx(SendIcon, {}) })] })] }));
}
// ─── Room ───────────────────────────────────────────────────────────────────
/** Meet-style call view. Must be rendered inside `<LiveKitRoom>`. */
export function AgendaMeetRoom({ labels, title }) {
    const [panel, setPanel] = useState(null);
    const [notice, setNotice] = useState(null);
    useEffect(() => {
        if (!notice)
            return;
        const id = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(id);
    }, [notice]);
    const participants = useParticipants();
    const chat = useChat();
    const connection = useConnectionState();
    const { localParticipant } = useLocalParticipant();
    const [seen, setSeen] = useState(0);
    useEffect(() => {
        if (panel === "chat")
            setSeen(chat.chatMessages.length);
    }, [panel, chat.chatMessages.length]);
    const unread = useMemo(() => chat.chatMessages.slice(seen).filter((m) => !m.from?.isLocal).length, [chat.chatMessages, seen]);
    // Meet shortcuts: Ctrl/⌘+D microphone, Ctrl/⌘+E camera.
    useEffect(() => {
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey)
                return;
            const key = e.key.toLowerCase();
            if (key === "d") {
                e.preventDefault();
                void localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
            }
            else if (key === "e") {
                e.preventDefault();
                void localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [localParticipant]);
    return (_jsxs("div", { className: `agv-room${panel ? " has-panel" : ""}`, children: [connection === ConnectionState.Reconnecting && _jsx("div", { className: "agv-banner", role: "status", children: labels.reconnecting }), notice && connection !== ConnectionState.Reconnecting && _jsx("div", { className: "agv-banner", role: "alert", children: notice }), _jsx(StartAudio, { label: labels.enableAudio, className: "agv-start-audio" }), _jsxs("div", { className: "agv-main", children: [_jsx(Stage, { labels: labels }), panel && (_jsxs("aside", { className: "agv-panel", "aria-label": panel === "people" ? labels.people : labels.chat, children: [_jsxs("header", { className: "agv-panel-head", children: [_jsx("h3", { children: panel === "people" ? labels.people : labels.chat }), _jsx("button", { type: "button", className: "agv-icon-btn", "aria-label": "\u00D7", onClick: () => setPanel(null), children: _jsx(CloseIcon, {}) })] }), panel === "people" ? (_jsx("ul", { className: "agv-people", children: participants.map((p) => (_jsx(PersonRow, { participant: p, labels: labels }, p.identity))) })) : (_jsx(ChatPanel, { labels: labels, chat: chat }))] }))] }), _jsx(ControlBar, { labels: labels, title: title, panel: panel, setPanel: setPanel, participantCount: participants.length, unread: unread, onDeviceError: () => setNotice(labels.deviceError) }), _jsx(RoomAudioRenderer, {})] }));
}
//# sourceMappingURL=room.js.map