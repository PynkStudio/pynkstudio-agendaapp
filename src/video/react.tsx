"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LiveKitRoom } from "@livekit/components-react";

import { DEFAULT_VIDEO_LABELS, type AgendaVideoCallLabels } from "./labels.js";
import { AgendaLobby, type LobbyChoices } from "./lobby.js";
import { AgendaMeetRoom } from "./room.js";

export { DEFAULT_VIDEO_LABELS, type AgendaVideoCallLabels } from "./labels.js";
export { AgendaLobby, type LobbyChoices } from "./lobby.js";
export { AgendaMeetRoom } from "./room.js";

export type VideoAccess = { serverUrl: string; token: string; displayName?: string };

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

type Phase =
  | { kind: "lobby" }
  | { kind: "connecting" }
  | { kind: "live"; access: VideoAccess; choices: LobbyChoices }
  | { kind: "left" }
  | { kind: "error"; message: string };

function messageFor(e: VideoAccessError, l: AgendaVideoCallLabels): string {
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

function Fullscreen({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return mounted ? createPortal(<div className="agv-fullscreen">{children}</div>, document.body) : null;
}

/**
 * Device check, then a Meet-style call: stage with grid / one-to-one / screen
 * share layouts, bottom bar with microphone, camera, device menus, screen
 * share and leave, people and chat panels. Import
 * `@pynkstudio/agendaapp/video/styles.css` once and theme it with the
 * `--agv-*` custom properties.
 */
export function AgendaVideoCall(props: AgendaVideoCallProps) {
  const l: AgendaVideoCallLabels = { ...DEFAULT_VIDEO_LABELS, ...props.labels };
  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });
  const fullscreen = props.fullscreen ?? true;
  const className = `agv ${props.className ?? ""}`.trim();

  async function join(choices: LobbyChoices) {
    setPhase({ kind: "connecting" });
    try {
      const access = await props.getAccess();
      if ("error" in access) setPhase({ kind: "error", message: messageFor(access, l) });
      else setPhase({ kind: "live", access, choices });
    } catch {
      setPhase({ kind: "error", message: l.generic });
    }
  }

  if (phase.kind === "live") {
    const { access, choices } = phase;
    const room = (
      <LiveKitRoom
        serverUrl={access.serverUrl}
        token={access.token}
        connect
        audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false}
        video={choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false}
        options={{
          adaptiveStream: true,
          dynacast: true,
          audioOutput: choices.audioOutputDeviceId ? { deviceId: choices.audioOutputDeviceId } : undefined,
        }}
        onDisconnected={() => {
          setPhase({ kind: "left" });
          props.onLeave?.();
        }}
        className={className}
      >
        <AgendaMeetRoom labels={l} title={props.title} />
      </LiveKitRoom>
    );
    return fullscreen ? <Fullscreen>{room}</Fullscreen> : room;
  }

  return (
    <div className={className}>
      {(phase.kind === "lobby" || phase.kind === "connecting") && (
        <AgendaLobby displayName={props.displayName} title={props.title} labels={l} busy={phase.kind === "connecting"} onJoin={join} />
      )}
      {(phase.kind === "left" || phase.kind === "error") && (
        <div className="agv-status">
          <p>{phase.kind === "left" ? l.left : phase.message}</p>
          <button type="button" className="agv-join" onClick={() => setPhase({ kind: "lobby" })}>
            {l.rejoin}
          </button>
        </div>
      )}
    </div>
  );
}
