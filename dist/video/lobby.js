"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaDevices, usePreviewTracks, useTrackVolume } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Avatar } from "./avatar.js";
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon } from "./icons.js";
function DeviceSelect({ kind, label, value, onChange, fallback, }) {
    const devices = useMediaDevices({ kind });
    if (devices.length === 0)
        return null;
    return (_jsxs("label", { className: "agv-lobby-select", children: [_jsx("span", { children: label }), _jsxs("select", { value: value, onChange: (e) => onChange(e.target.value), children: [!devices.some((d) => d.deviceId === value) && _jsx("option", { value: "", children: fallback }), devices.map((d, i) => (_jsx("option", { value: d.deviceId, children: d.label || `${label} ${i + 1}` }, d.deviceId || i)))] })] }));
}
function MicLevel({ track }) {
    const volume = useTrackVolume(track);
    return (_jsx("span", { className: "agv-level", "aria-hidden": "true", children: [0.08, 0.2, 0.35].map((threshold) => (_jsx("i", { className: volume > threshold ? "is-on" : "" }, threshold))) }));
}
/** Device check before entering: preview, toggles, device choice, fixed display name. */
export function AgendaLobby({ displayName, title, labels: l, busy, onJoin }) {
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [audioDeviceId, setAudioDeviceId] = useState("");
    const [videoDeviceId, setVideoDeviceId] = useState("");
    const [audioOutputDeviceId, setAudioOutputDeviceId] = useState("");
    const [error, setError] = useState(null);
    const videoEl = useRef(null);
    const options = useMemo(() => ({
        audio: audioEnabled ? { deviceId: audioDeviceId || undefined } : false,
        video: videoEnabled ? { deviceId: videoDeviceId || undefined } : false,
    }), [audioEnabled, videoEnabled, audioDeviceId, videoDeviceId]);
    // Blocked or missing devices: show it and switch the toggles off, so the
    // buttons tell the truth and the user can retry by turning them back on.
    const tracks = usePreviewTracks(options, () => {
        setError(l.deviceError);
        setAudioEnabled(false);
        setVideoEnabled(false);
    });
    const videoTrack = tracks?.find((t) => t.kind === Track.Kind.Video);
    const audioTrack = tracks?.find((t) => t.kind === Track.Kind.Audio);
    useEffect(() => {
        if (tracks?.length)
            setError(null);
    }, [tracks]);
    useEffect(() => {
        const el = videoEl.current;
        if (!el || !videoTrack)
            return;
        videoTrack.attach(el);
        return () => {
            videoTrack.detach(el);
        };
    }, [videoTrack]);
    return (_jsxs("div", { className: "agv-lobby", children: [_jsxs("div", { className: "agv-lobby-preview", children: [_jsxs("div", { className: "agv-lobby-video", children: [videoEnabled && videoTrack ? (_jsx("video", { ref: videoEl, muted: true, playsInline: true, autoPlay: true, className: "agv-mirror" })) : (_jsxs("div", { className: "agv-lobby-novideo", children: [_jsx(Avatar, { name: displayName, size: "lg" }), _jsx("span", { children: l.cameraOffPreview })] })), _jsx("span", { className: "agv-lobby-name", children: displayName }), _jsxs("div", { className: "agv-lobby-toggles", children: [_jsx("button", { type: "button", className: `agv-round${audioEnabled ? "" : " is-off"}`, "aria-pressed": !audioEnabled, "aria-label": audioEnabled ? l.micOn : l.micOff, title: audioEnabled ? l.micOn : l.micOff, onClick: () => setAudioEnabled((v) => !v), children: audioEnabled ? _jsx(MicIcon, {}) : _jsx(MicOffIcon, {}) }), _jsx("button", { type: "button", className: `agv-round${videoEnabled ? "" : " is-off"}`, "aria-pressed": !videoEnabled, "aria-label": videoEnabled ? l.cameraOn : l.cameraOff, title: videoEnabled ? l.cameraOn : l.cameraOff, onClick: () => setVideoEnabled((v) => !v), children: videoEnabled ? _jsx(CamIcon, {}) : _jsx(CamOffIcon, {}) })] }), audioEnabled && _jsx(MicLevel, { track: audioTrack })] }), _jsxs("div", { className: "agv-lobby-devices", children: [_jsx(DeviceSelect, { kind: "audioinput", label: l.microphone, value: audioDeviceId, onChange: setAudioDeviceId, fallback: l.defaultDevice }), _jsx(DeviceSelect, { kind: "audiooutput", label: l.speaker, value: audioOutputDeviceId, onChange: setAudioOutputDeviceId, fallback: l.defaultDevice }), _jsx(DeviceSelect, { kind: "videoinput", label: l.camera, value: videoDeviceId, onChange: setVideoDeviceId, fallback: l.defaultDevice })] }), error && _jsx("p", { className: "agv-lobby-error", role: "alert", children: error })] }), _jsxs("div", { className: "agv-lobby-side", children: [_jsx("h2", { className: "agv-lobby-title", children: l.readyTitle }), title && _jsx("p", { className: "agv-lobby-subtitle", children: title }), _jsxs("p", { className: "agv-lobby-as", children: [l.joiningAs, " ", _jsx("strong", { children: displayName })] }), _jsx("button", { type: "button", className: "agv-join", disabled: busy, onClick: () => onJoin({ audioEnabled, videoEnabled, audioDeviceId, videoDeviceId, audioOutputDeviceId }), children: busy ? l.connecting : l.join })] })] }));
}
//# sourceMappingURL=lobby.js.map