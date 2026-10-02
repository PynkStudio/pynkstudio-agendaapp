"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaDevices, usePreviewTracks, useTrackVolume } from "@livekit/components-react";
import { Track, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";

import { Avatar } from "./avatar.js";
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon } from "./icons.js";
import type { AgendaVideoCallLabels } from "./labels.js";

export type LobbyChoices = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId: string;
  videoDeviceId: string;
  audioOutputDeviceId: string;
};

type Props = {
  displayName: string;
  title?: string;
  labels: AgendaVideoCallLabels;
  busy: boolean;
  onJoin: (choices: LobbyChoices) => void;
};

function DeviceSelect({
  kind,
  label,
  value,
  onChange,
  fallback,
}: {
  kind: MediaDeviceKind;
  label: string;
  value: string;
  onChange: (id: string) => void;
  fallback: string;
}) {
  const devices = useMediaDevices({ kind });
  if (devices.length === 0) return null;
  return (
    <label className="agv-lobby-select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!devices.some((d) => d.deviceId === value) && <option value="">{fallback}</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function MicLevel({ track }: { track?: LocalAudioTrack }) {
  const volume = useTrackVolume(track);
  return (
    <span className="agv-level" aria-hidden="true">
      {[0.08, 0.2, 0.35].map((threshold) => (
        <i key={threshold} className={volume > threshold ? "is-on" : ""} />
      ))}
    </span>
  );
}

/** Device check before entering: preview, toggles, device choice, fixed display name. */
export function AgendaLobby({ displayName, title, labels: l, busy, onJoin }: Props) {
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioDeviceId, setAudioDeviceId] = useState("");
  const [videoDeviceId, setVideoDeviceId] = useState("");
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const videoEl = useRef<HTMLVideoElement>(null);

  const options = useMemo(
    () => ({
      audio: audioEnabled ? { deviceId: audioDeviceId || undefined } : false,
      video: videoEnabled ? { deviceId: videoDeviceId || undefined } : false,
    }),
    [audioEnabled, videoEnabled, audioDeviceId, videoDeviceId],
  );
  // Blocked or missing devices: show it and switch the toggles off, so the
  // buttons tell the truth and the user can retry by turning them back on.
  const tracks = usePreviewTracks(options, () => {
    setError(l.deviceError);
    setAudioEnabled(false);
    setVideoEnabled(false);
  });
  const videoTrack = tracks?.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
  const audioTrack = tracks?.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;

  useEffect(() => {
    if (tracks?.length) setError(null);
  }, [tracks]);

  useEffect(() => {
    const el = videoEl.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  return (
    <div className="agv-lobby">
      <div className="agv-lobby-preview">
        <div className="agv-lobby-video">
          {videoEnabled && videoTrack ? (
            <video ref={videoEl} muted playsInline autoPlay className="agv-mirror" />
          ) : (
            <div className="agv-lobby-novideo">
              <Avatar name={displayName} size="lg" />
              <span>{l.cameraOffPreview}</span>
            </div>
          )}
          <span className="agv-lobby-name">{displayName}</span>
          <div className="agv-lobby-toggles">
            <button
              type="button"
              className={`agv-round${audioEnabled ? "" : " is-off"}`}
              aria-pressed={!audioEnabled}
              aria-label={audioEnabled ? l.micOn : l.micOff}
              title={audioEnabled ? l.micOn : l.micOff}
              onClick={() => setAudioEnabled((v) => !v)}
            >
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              type="button"
              className={`agv-round${videoEnabled ? "" : " is-off"}`}
              aria-pressed={!videoEnabled}
              aria-label={videoEnabled ? l.cameraOn : l.cameraOff}
              title={videoEnabled ? l.cameraOn : l.cameraOff}
              onClick={() => setVideoEnabled((v) => !v)}
            >
              {videoEnabled ? <CamIcon /> : <CamOffIcon />}
            </button>
          </div>
          {audioEnabled && <MicLevel track={audioTrack} />}
        </div>
        <div className="agv-lobby-devices">
          <DeviceSelect kind="audioinput" label={l.microphone} value={audioDeviceId} onChange={setAudioDeviceId} fallback={l.defaultDevice} />
          <DeviceSelect kind="audiooutput" label={l.speaker} value={audioOutputDeviceId} onChange={setAudioOutputDeviceId} fallback={l.defaultDevice} />
          <DeviceSelect kind="videoinput" label={l.camera} value={videoDeviceId} onChange={setVideoDeviceId} fallback={l.defaultDevice} />
        </div>
        {error && <p className="agv-lobby-error" role="alert">{error}</p>}
      </div>

      <div className="agv-lobby-side">
        <h2 className="agv-lobby-title">{l.readyTitle}</h2>
        {title && <p className="agv-lobby-subtitle">{title}</p>}
        <p className="agv-lobby-as">
          {l.joiningAs} <strong>{displayName}</strong>
        </p>
        <button
          type="button"
          className="agv-join"
          disabled={busy}
          onClick={() => onJoin({ audioEnabled, videoEnabled, audioDeviceId, videoDeviceId, audioOutputDeviceId })}
        >
          {busy ? l.connecting : l.join}
        </button>
      </div>
    </div>
  );
}
