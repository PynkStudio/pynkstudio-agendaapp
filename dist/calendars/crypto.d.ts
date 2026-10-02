/** AES-256-GCM. Output `v1.<base64url(iv|tag|ciphertext)>`. */
export declare function encryptJson(secret: string, value: unknown): string;
export declare function decryptJson<T>(secret: string, payload: string): T;
export type OAuthState = {
    scope: string;
    hostId: string;
    provider: string;
    returnTo?: string;
};
/** Signed, expiring OAuth `state`, so the callback trusts scope and host without a session table. */
export declare function signState(secret: string, state: OAuthState, ttlSeconds?: number): string;
export declare function verifyState(secret: string, token: string | null | undefined): OAuthState | null;
//# sourceMappingURL=crypto.d.ts.map