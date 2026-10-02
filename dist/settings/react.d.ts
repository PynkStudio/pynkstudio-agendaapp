import { type AgendaSettingsLabels } from "./labels.js";
export { SETTINGS_LABELS, type AgendaSettingsLabels } from "./labels.js";
export type AgendaSettingsEndpoints = {
    /** `settingsGet` (GET) and `settingsSaveEventType` (PUT) mounted on the same path. */
    settings: string;
    /** `settingsUpdateHost` (PATCH). */
    host: string;
    /** `calendarsManage` (POST / DELETE). */
    calendars: string;
    /** `calendarOAuthStart` (GET, navigated to). */
    oauthStart: string;
};
export type AgendaSettingsPanelProps = {
    endpoints: AgendaSettingsEndpoints;
    /** Path the OAuth flow comes back to (usually the current page). */
    returnTo: string;
    locale?: "it" | "en";
    labels?: Partial<AgendaSettingsLabels>;
    /** Show the team section (hosts and calendars). Default true. */
    showTeam?: boolean;
    className?: string;
};
/**
 * Settings page for agenda owners: hours and days, simultaneous places,
 * holidays and closed days, who takes bookings, and each team member's
 * personal hours and connected calendars.
 */
export declare function AgendaSettingsPanel(props: AgendaSettingsPanelProps): import("react").JSX.Element;
//# sourceMappingURL=react.d.ts.map