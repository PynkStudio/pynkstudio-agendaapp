/**
 * LiveKit access tokens and webhook verification.
 *
 * Both are HS256 JWTs signed with the API secret, so `node:crypto` is enough
 * and the package does not need `livekit-server-sdk`. Server only.
 */
export type LivekitCredentials = {
    /** `wss://…` URL browsers connect to. */
    url: string;
    apiKey: string;
    apiSecret: string;
};
export type LivekitVideoGrant = {
    room: string;
    roomJoin: true;
    canPublish?: boolean;
    canSubscribe?: boolean;
    canPublishData?: boolean;
    /** Mute/kick others and end the room. Give it to the host only. */
    roomAdmin?: boolean;
    /** Keeps the participant out of the participant list (recorders, monitors). */
    hidden?: boolean;
};
export type LivekitTokenInput = {
    identity: string;
    name?: string;
    metadata?: string;
    ttlSeconds?: number;
    grant: LivekitVideoGrant;
    now?: Date;
};
export declare function createLivekitToken(credentials: Pick<LivekitCredentials, "apiKey" | "apiSecret">, input: LivekitTokenInput): string;
type JwtClaims = Record<string, unknown> & {
    iss?: string;
    exp?: number;
    nbf?: number;
};
/** Verifies an HS256 JWT against `secret`. Fail-closed: any anomaly returns null. */
export declare function verifyHs256(token: string, secret: string, now?: Date): JwtClaims | null;
export type LivekitWebhookEvent = {
    event: string;
    id?: string;
    createdAt?: string | number;
    room?: {
        sid?: string;
        name?: string;
        numParticipants?: number;
    };
    participant?: {
        sid?: string;
        identity?: string;
        name?: string;
    };
    [key: string]: unknown;
};
/**
 * Verifies a LiveKit webhook: the `Authorization` header is a JWT issued by our
 * API key whose `sha256` claim is the base64 SHA-256 of the raw body.
 * Returns the parsed event, or null when anything does not match.
 */
export declare function verifyLivekitWebhook(credentials: Pick<LivekitCredentials, "apiKey" | "apiSecret">, rawBody: string, authorization: string | null, now?: Date): LivekitWebhookEvent | null;
export {};
//# sourceMappingURL=livekit.d.ts.map