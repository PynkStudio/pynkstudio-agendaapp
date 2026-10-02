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
/** Device check before entering: preview, toggles, device choice, fixed display name. */
export declare function AgendaLobby({ displayName, title, labels: l, busy, onJoin }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=lobby.d.ts.map