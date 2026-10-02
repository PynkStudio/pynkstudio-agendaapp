"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  isTrackReference,
  useChat,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useMediaDeviceSelect,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";

import { Avatar } from "./avatar.js";
import {
  CamIcon,
  CamOffIcon,
  ChatIcon,
  CheckIcon,
  ChevronUpIcon,
  CloseIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  ScreenIcon,
  SendIcon,
} from "./icons.js";
import type { AgendaVideoCallLabels } from "./labels.js";

type Panel = "people" | "chat" | null;

function nameOf(p: Participant): string {
  return p.name || p.identity;
}

// ─── Tiles ──────────────────────────────────────────────────────────────────

function Tile({ trackRef, labels, variant = "grid" }: { trackRef: TrackReferenceOrPlaceholder; labels: AgendaVideoCallLabels; variant?: "grid" | "pip" | "strip" }) {
  const p = trackRef.participant;
  const speaking = useIsSpeaking(p);
  const camMuted = useIsMuted(trackRef);
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const showVideo = isTrackReference(trackRef) && !camMuted;
  const name = p.isLocal ? `${nameOf(p)} (${labels.you})` : nameOf(p);

  return (
    <div className={`agv-tile agv-tile-${variant}${speaking && !micMuted ? " is-speaking" : ""}`}>
      {showVideo ? (
        <VideoTrack trackRef={trackRef} className={p.isLocal ? "agv-mirror" : undefined} />
      ) : (
        <div className="agv-tile-avatar">
          <Avatar name={nameOf(p)} size={variant === "grid" ? "lg" : "md"} />
        </div>
      )}
      <span className="agv-tile-name">
        {micMuted && <MicOffIcon className="agv-tile-muted" />}
        {name}
      </span>
    </div>
  );
}

function ScreenTile({ trackRef, labels }: { trackRef: TrackReferenceOrPlaceholder; labels: AgendaVideoCallLabels }) {
  if (!isTrackReference(trackRef)) return null;
  return (
    <div className="agv-screen">
      <VideoTrack trackRef={trackRef} />
      <span className="agv-tile-name">{labels.presenting(nameOf(trackRef.participant))}</span>
    </div>
  );
}

function Stage({ labels }: { labels: AgendaVideoCallLabels }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare && isTrackReference(t));
  const cams = tracks.filter((t) => t.source === Track.Source.Camera);

  if (screens.length > 0) {
    return (
      <div className="agv-stage agv-stage-present">
        <ScreenTile trackRef={screens[0]} labels={labels} />
        <div className="agv-strip">
          {cams.map((t) => (
            <Tile key={t.participant.identity} trackRef={t} labels={labels} variant="strip" />
          ))}
        </div>
      </div>
    );
  }

  if (cams.length === 1) {
    return (
      <div className="agv-stage agv-stage-alone">
        <Tile trackRef={cams[0]} labels={labels} />
        <p className="agv-waiting">{labels.waitingAlone}</p>
      </div>
    );
  }

  // 1:1 like a phone call: the other person fills the stage, you float in a corner.
  if (cams.length === 2) {
    const remote = cams.find((t) => !t.participant.isLocal) ?? cams[0];
    const local = cams.find((t) => t.participant.isLocal) ?? cams[1];
    return (
      <div className="agv-stage agv-stage-duo">
        <Tile trackRef={remote} labels={labels} />
        <Tile trackRef={local} labels={labels} variant="pip" />
      </div>
    );
  }

  const cols = Math.ceil(Math.sqrt(cams.length));
  return (
    <div className="agv-stage agv-stage-grid" style={{ ["--agv-cols" as string]: String(cols) }}>
      {cams.map((t) => (
        <Tile key={t.participant.identity} trackRef={t} labels={labels} />
      ))}
    </div>
  );
}

// ─── Controls ───────────────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, active]);
}

function DeviceList({ kind, title, empty }: { kind: MediaDeviceKind; title: string; empty?: string }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind, requestPermissions: false });
  if (devices.length === 0) {
    return empty ? (
      <div className="agv-menu-group">
        <p className="agv-menu-title">{title}</p>
        <p className="agv-menu-empty">{empty}</p>
      </div>
    ) : null;
  }
  return (
    <div className="agv-menu-group">
      <p className="agv-menu-title">{title}</p>
      {devices.map((d, i) => {
        // "default" or an unknown id means the browser's first device is in use.
        const known = devices.some((x) => x.deviceId === activeDeviceId);
        const active = known ? d.deviceId === activeDeviceId : i === 0;
        return (
          <button key={d.deviceId || i} type="button" className="agv-menu-item" onClick={() => void setActiveMediaDevice(d.deviceId)}>
            <span className="agv-menu-check">{active && <CheckIcon />}</span>
            {d.label || `${title} ${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}

function ToggleWithMenu({
  source,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  menu,
  menuLabel,
  onDeviceError,
}: {
  source: Track.Source.Microphone | Track.Source.Camera;
  onLabel: string;
  offLabel: string;
  OnIcon: typeof MicIcon;
  OffIcon: typeof MicIcon;
  menu: ReactNode;
  menuLabel: string;
  onDeviceError: () => void;
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source, onDeviceError });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useClickOutside(box, () => setOpen(false), open);
  const label = enabled ? onLabel : offLabel;

  return (
    <div className={`agv-split${enabled ? "" : " is-off"}`} ref={box}>
      <button type="button" className="agv-split-menu" aria-label={menuLabel} title={menuLabel} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronUpIcon />
      </button>
      <button type="button" className="agv-split-main" aria-label={label} title={label} aria-pressed={!enabled} disabled={pending} onClick={() => void toggle()}>
        {enabled ? <OnIcon /> : <OffIcon />}
      </button>
      {open && <div className="agv-menu" role="menu">{menu}</div>}
    </div>
  );
}

function ScreenShareButton({ labels }: { labels: AgendaVideoCallLabels }) {
  const { toggle, enabled, pending } = useTrackToggle({ source: Track.Source.ScreenShare });
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices;
  if (!supported) return null;
  const label = enabled ? labels.stopSharing : labels.shareScreen;
  return (
    <button type="button" className={`agv-round${enabled ? " is-active" : ""}`} aria-label={label} title={label} aria-pressed={enabled} disabled={pending} onClick={() => void toggle()}>
      <ScreenIcon />
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return <span className="agv-clock">{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>;
}

function ControlBar({
  labels,
  title,
  panel,
  setPanel,
  participantCount,
  unread,
  onDeviceError,
}: {
  labels: AgendaVideoCallLabels;
  title?: string;
  panel: Panel;
  setPanel: (p: Panel) => void;
  participantCount: number;
  unread: number;
  onDeviceError: () => void;
}) {
  const room = useRoomContext();
  return (
    <div className="agv-bar">
      <div className="agv-bar-left">
        <Clock />
        {title && <span className="agv-bar-title">{title}</span>}
      </div>
      <div className="agv-bar-center">
        <ToggleWithMenu
          source={Track.Source.Microphone}
          onLabel={labels.micOn}
          offLabel={labels.micOff}
          OnIcon={MicIcon}
          OffIcon={MicOffIcon}
          menuLabel={labels.deviceSettings}
          onDeviceError={onDeviceError}
          menu={
            <>
              <DeviceList kind="audioinput" title={labels.microphone} empty={labels.noDevices} />
              <DeviceList kind="audiooutput" title={labels.speaker} />
            </>
          }
        />
        <ToggleWithMenu
          source={Track.Source.Camera}
          onLabel={labels.cameraOn}
          offLabel={labels.cameraOff}
          OnIcon={CamIcon}
          OffIcon={CamOffIcon}
          menuLabel={labels.deviceSettings}
          onDeviceError={onDeviceError}
          menu={<DeviceList kind="videoinput" title={labels.camera} empty={labels.noDevices} />}
        />
        <ScreenShareButton labels={labels} />
        <button type="button" className="agv-leave" aria-label={labels.leave} title={labels.leave} onClick={() => void room.disconnect()}>
          <LeaveIcon />
        </button>
      </div>
      <div className="agv-bar-right">
        <button
          type="button"
          className={`agv-icon-btn${panel === "people" ? " is-active" : ""}`}
          aria-label={labels.people}
          title={labels.people}
          aria-pressed={panel === "people"}
          onClick={() => setPanel(panel === "people" ? null : "people")}
        >
          <PeopleIcon />
          <span className="agv-badge agv-badge-count">{participantCount}</span>
        </button>
        <button
          type="button"
          className={`agv-icon-btn${panel === "chat" ? " is-active" : ""}`}
          aria-label={labels.chat}
          title={labels.chat}
          aria-pressed={panel === "chat"}
          onClick={() => setPanel(panel === "chat" ? null : "chat")}
        >
          <ChatIcon />
          {unread > 0 && <span className="agv-badge">{unread}</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Side panels ────────────────────────────────────────────────────────────

function PersonRow({ participant, labels }: { participant: Participant; labels: AgendaVideoCallLabels }) {
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  return (
    <li className="agv-person">
      <Avatar name={nameOf(participant)} size="sm" />
      <span className="agv-person-name">
        {nameOf(participant)}
        {participant.isLocal && <em> ({labels.you})</em>}
      </span>
      {micMuted ? <MicOffIcon className="agv-person-mic is-off" /> : <MicIcon className="agv-person-mic" />}
    </li>
  );
}

function ChatPanel({ labels, chat }: { labels: AgendaVideoCallLabels; chat: ReturnType<typeof useChat> }) {
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.chatMessages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await chat.send(text);
  };

  return (
    <>
      <div className="agv-chat-list" ref={list}>
        {chat.chatMessages.length === 0 && <p className="agv-chat-empty">{labels.noMessages}</p>}
        {chat.chatMessages.map((m) => (
          <div key={m.id} className="agv-chat-msg">
            <p className="agv-chat-meta">
              <strong>{m.from ? (m.from.isLocal ? labels.you : nameOf(m.from)) : "—"}</strong>
              <span>{new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
            </p>
            <p className="agv-chat-text">{m.message}</p>
          </div>
        ))}
      </div>
      <form className="agv-chat-form" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={labels.chatPlaceholder} aria-label={labels.chatPlaceholder} />
        <button type="submit" aria-label={labels.send} title={labels.send} disabled={chat.isSending || !draft.trim()}>
          <SendIcon />
        </button>
      </form>
    </>
  );
}

// ─── Room ───────────────────────────────────────────────────────────────────

/** Meet-style call view. Must be rendered inside `<LiveKitRoom>`. */
export function AgendaMeetRoom({ labels, title }: { labels: AgendaVideoCallLabels; title?: string }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const participants = useParticipants();
  const chat = useChat();
  const connection = useConnectionState();
  const { localParticipant } = useLocalParticipant();

  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (panel === "chat") setSeen(chat.chatMessages.length);
  }, [panel, chat.chatMessages.length]);
  const unread = useMemo(
    () => chat.chatMessages.slice(seen).filter((m) => !m.from?.isLocal).length,
    [chat.chatMessages, seen],
  );

  // Meet shortcuts: Ctrl/⌘+D microphone, Ctrl/⌘+E camera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        void localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
      } else if (key === "e") {
        e.preventDefault();
        void localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [localParticipant]);

  return (
    <div className={`agv-room${panel ? " has-panel" : ""}`}>
      {connection === ConnectionState.Reconnecting && <div className="agv-banner" role="status">{labels.reconnecting}</div>}
      {notice && connection !== ConnectionState.Reconnecting && <div className="agv-banner" role="alert">{notice}</div>}
      <StartAudio label={labels.enableAudio} className="agv-start-audio" />
      <div className="agv-main">
        <Stage labels={labels} />
        {panel && (
          <aside className="agv-panel" aria-label={panel === "people" ? labels.people : labels.chat}>
            <header className="agv-panel-head">
              <h3>{panel === "people" ? labels.people : labels.chat}</h3>
              <button type="button" className="agv-icon-btn" aria-label="×" onClick={() => setPanel(null)}>
                <CloseIcon />
              </button>
            </header>
            {panel === "people" ? (
              <ul className="agv-people">
                {participants.map((p) => (
                  <PersonRow key={p.identity} participant={p} labels={labels} />
                ))}
              </ul>
            ) : (
              <ChatPanel labels={labels} chat={chat} />
            )}
          </aside>
        )}
      </div>
      <ControlBar labels={labels} title={title} panel={panel} setPanel={setPanel} participantCount={participants.length} unread={unread} onDeviceError={() => setNotice(labels.deviceError)} />
      <RoomAudioRenderer />
    </div>
  );
}
