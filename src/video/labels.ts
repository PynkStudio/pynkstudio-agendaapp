export type AgendaVideoCallLabels = {
  // Lobby
  readyTitle: string;
  joiningAs: string;
  join: string;
  microphone: string;
  camera: string;
  speaker: string;
  defaultDevice: string;
  cameraOffPreview: string;
  deviceError: string;
  // Call
  micOn: string;
  micOff: string;
  cameraOn: string;
  cameraOff: string;
  shareScreen: string;
  stopSharing: string;
  presenting: (name: string) => string;
  deviceSettings: string;
  noDevices: string;
  leave: string;
  people: string;
  chat: string;
  you: string;
  waitingAlone: string;
  chatPlaceholder: string;
  send: string;
  noMessages: string;
  reconnecting: string;
  enableAudio: string;
  // States
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
  readyTitle: "Ready to join?",
  joiningAs: "You will join as",
  join: "Join now",
  microphone: "Microphone",
  camera: "Camera",
  speaker: "Speaker",
  defaultDevice: "Default",
  cameraOffPreview: "Camera is off",
  deviceError: "Camera or microphone not available. Check the browser permissions.",
  micOn: "Turn off microphone",
  micOff: "Turn on microphone",
  cameraOn: "Turn off camera",
  cameraOff: "Turn on camera",
  shareScreen: "Present your screen",
  stopSharing: "Stop presenting",
  presenting: (name) => `${name} is presenting`,
  deviceSettings: "Device settings",
  noDevices: "No devices found. Check the browser permissions.",
  leave: "Leave call",
  people: "People",
  chat: "Chat",
  you: "You",
  waitingAlone: "Waiting for others to join…",
  chatPlaceholder: "Send a message",
  send: "Send",
  noMessages: "Messages are only visible to people in the call and are deleted when it ends.",
  reconnecting: "Connection lost. Reconnecting…",
  enableAudio: "Click to enable audio",
  connecting: "Connecting…",
  left: "You left the call.",
  rejoin: "Rejoin",
  tooEarly: (opensAt) =>
    `The room opens at ${opensAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`,
  ended: "This call has ended.",
  cancelled: "This appointment was cancelled.",
  forbidden: "This link is not valid.",
  generic: "Could not join the call. Please try again.",
};
