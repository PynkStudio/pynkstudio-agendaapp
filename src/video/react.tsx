"use client";

import { useState } from "react";
import { LiveKitRoom, PreJoin, VideoConference } from "@livekit/components-react";
import type { LocalUserChoices } from "@livekit/components-react";

export type VideoAccess = { serverUrl: string; token: string };

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

export const DEFAULT_VIDEO_LABELS: AgendaVideoCallLabels = {
  join: "Join call",
  mic: "Microphone",
  camera: "Camera",
  name: "Name",
  connecting: "Connecting…",
  left: "You left the call.",
  rejoin: "Join again",
  tooEarly: (opensAt) =>
    `The room opens at ${opensAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`,
  ended: "This call has ended.",
  cancelled: "This appointment was cancelled.",
  forbidden: "This link is not valid.",
  generic: "Could not join the call. Please try again.",
};

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

type Phase =
  | { kind: "prejoin" }
  | { kind: "connecting" }
  | { kind: "live"; access: VideoAccess; choices: LocalUserChoices }
  | { kind: "left" }
  | { kind: "error"; message: string };

/**
 * Device check, then the LiveKit prefab conference. Hosts must load
 * `@livekit/components-styles` once (e.g. in the page that renders this) and
 * may theme it through its `--lk-*` custom properties.
 */
export function AgendaVideoCall(props: AgendaVideoCallProps) {
  const l = { ...DEFAULT_VIDEO_LABELS, ...props.labels };
  const [phase, setPhase] = useState<Phase>({ kind: "prejoin" });
  const { getAccess, onLeave } = props;

  function messageFor(e: VideoAccessError): string {
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

  async function join(choices: LocalUserChoices) {
    setPhase({ kind: "connecting" });
    try {
      const access = await getAccess();
      if ("error" in access) setPhase({ kind: "error", message: messageFor(access) });
      else setPhase({ kind: "live", access, choices });
    } catch {
      setPhase({ kind: "error", message: l.generic });
    }
  }

  const className = `ag-video ${props.className ?? ""}`.trim();

  if (phase.kind === "live") {
    return (
      <div className={className} data-lk-theme="default">
        <LiveKitRoom
          serverUrl={phase.access.serverUrl}
          token={phase.access.token}
          connect
          video={phase.choices.videoEnabled ? { deviceId: phase.choices.videoDeviceId } : false}
          audio={phase.choices.audioEnabled ? { deviceId: phase.choices.audioDeviceId } : false}
          onDisconnected={() => {
            setPhase({ kind: "left" });
            onLeave?.();
          }}
          style={{ height: "100%" }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div className={className} data-lk-theme="default">
      {phase.kind === "prejoin" && (
        <PreJoin
          defaults={{ username: props.displayName ?? "" }}
          onSubmit={join}
          joinLabel={l.join}
          micLabel={l.mic}
          camLabel={l.camera}
          userLabel={l.name}
          persistUserChoices={false}
        />
      )}
      {phase.kind === "connecting" && <p className="ag-note">{l.connecting}</p>}
      {(phase.kind === "left" || phase.kind === "error") && (
        <div className="ag-video-status">
          <p className="ag-note">{phase.kind === "left" ? l.left : phase.message}</p>
          <button type="button" className="ag-submit" onClick={() => setPhase({ kind: "prejoin" })}>
            {l.rejoin}
          </button>
        </div>
      )}
    </div>
  );
}
