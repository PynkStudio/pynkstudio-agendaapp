/**
 * LiveKit access tokens and webhook verification.
 *
 * Both are HS256 JWTs signed with the API secret, so `node:crypto` is enough
 * and the package does not need `livekit-server-sdk`. Server only.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
function b64url(input) {
    return Buffer.from(input).toString("base64url");
}
function sign(data, secret) {
    return createHmac("sha256", secret).update(data).digest("base64url");
}
export function createLivekitToken(credentials, input) {
    const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
    const payload = {
        iss: credentials.apiKey,
        sub: input.identity,
        jti: input.identity,
        nbf: nowSec - 10,
        exp: nowSec + (input.ttlSeconds ?? 2 * 3600),
        video: {
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            ...input.grant,
        },
    };
    if (input.name)
        payload.name = input.name;
    if (input.metadata)
        payload.metadata = input.metadata;
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(payload));
    return `${head}.${body}.${sign(`${head}.${body}`, credentials.apiSecret)}`;
}
/** Verifies an HS256 JWT against `secret`. Fail-closed: any anomaly returns null. */
export function verifyHs256(token, secret, now = new Date()) {
    const parts = token.split(".");
    if (parts.length !== 3)
        return null;
    const [head, body, signature] = parts;
    let header;
    let claims;
    try {
        header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
        claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
    if (header.alg !== "HS256")
        return null;
    const expected = Buffer.from(sign(`${head}.${body}`, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        return null;
    const nowSec = Math.floor(now.getTime() / 1000);
    // LiveKit and our own tokens allow a little clock skew.
    if (typeof claims.exp === "number" && claims.exp + 60 < nowSec)
        return null;
    if (typeof claims.nbf === "number" && claims.nbf - 60 > nowSec)
        return null;
    return claims;
}
/**
 * Verifies a LiveKit webhook: the `Authorization` header is a JWT issued by our
 * API key whose `sha256` claim is the base64 SHA-256 of the raw body.
 * Returns the parsed event, or null when anything does not match.
 */
export function verifyLivekitWebhook(credentials, rawBody, authorization, now = new Date()) {
    if (!authorization)
        return null;
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const claims = verifyHs256(token, credentials.apiSecret, now);
    if (!claims || claims.iss !== credentials.apiKey)
        return null;
    const digest = createHash("sha256").update(rawBody).digest("base64");
    if (typeof claims.sha256 !== "string")
        return null;
    const a = Buffer.from(claims.sha256);
    const b = Buffer.from(digest);
    if (a.length !== b.length || !timingSafeEqual(a, b))
        return null;
    try {
        const event = JSON.parse(rawBody);
        return typeof event?.event === "string" ? event : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=livekit.js.map