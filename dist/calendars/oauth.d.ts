import { type CalendarsConfig, type OAuthCredentials } from "./types.js";
type Provider = "google" | "microsoft";
export declare function oauthConfigured(cfg: CalendarsConfig | null | undefined, provider: Provider): boolean;
export declare function authorizationUrl(cfg: CalendarsConfig, provider: Provider, state: string): string;
export declare function exchangeCode(cfg: CalendarsConfig, provider: Provider, code: string): Promise<{
    credentials: OAuthCredentials;
    account: string | null;
}>;
/** A usable access token, refreshed when it expires within a minute. */
export declare function freshCredentials(cfg: CalendarsConfig, provider: Provider, creds: OAuthCredentials): Promise<OAuthCredentials>;
export {};
//# sourceMappingURL=oauth.d.ts.map