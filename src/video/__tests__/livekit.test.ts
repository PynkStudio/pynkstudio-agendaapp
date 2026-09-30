import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createLivekitToken, verifyHs256, verifyLivekitWebhook } from "../livekit.js";

const creds = { apiKey: "APIkey123", apiSecret: "secret-secret-secret-secret" };

function signJwt(payload: object, secret: string): string {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

describe("createLivekitToken", () => {
  it("issues a token LiveKit can verify with the same secret", () => {
    const now = new Date("2026-10-05T08:00:00Z");
    const token = createLivekitToken(creds, {
      identity: "guest:1",
      name: "Ada",
      grant: { room: "agenda-1", roomJoin: true },
      ttlSeconds: 600,
      now,
    });
    const claims = verifyHs256(token, creds.apiSecret, now);
    expect(claims).toMatchObject({
      iss: "APIkey123",
      sub: "guest:1",
      name: "Ada",
      video: { room: "agenda-1", roomJoin: true, canPublish: true, canSubscribe: true },
    });
    expect(claims?.exp).toBe(Math.floor(now.getTime() / 1000) + 600);
    expect(verifyHs256(token, "another-secret", now)).toBeNull();
    expect(verifyHs256(token, creds.apiSecret, new Date("2026-10-05T09:00:00Z"))).toBeNull();
  });
});

describe("verifyLivekitWebhook", () => {
  const body = JSON.stringify({ event: "room_finished", id: "EV_1", room: { name: "agenda-1" } });
  const sha = createHash("sha256").update(body).digest("base64");
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);

  it("accepts a correctly signed event", () => {
    const auth = signJwt({ iss: creds.apiKey, sha256: sha, exp: nowSec + 60, nbf: nowSec - 1 }, creds.apiSecret);
    expect(verifyLivekitWebhook(creds, body, auth, now)?.event).toBe("room_finished");
    expect(verifyLivekitWebhook(creds, body, `Bearer ${auth}`, now)?.event).toBe("room_finished");
  });

  it("rejects a tampered body, a foreign key or a missing header", () => {
    const auth = signJwt({ iss: creds.apiKey, sha256: sha, exp: nowSec + 60 }, creds.apiSecret);
    expect(verifyLivekitWebhook(creds, body.replace("finished", "started"), auth, now)).toBeNull();
    const foreign = signJwt({ iss: "other", sha256: sha, exp: nowSec + 60 }, creds.apiSecret);
    expect(verifyLivekitWebhook(creds, body, foreign, now)).toBeNull();
    expect(verifyLivekitWebhook(creds, body, null, now)).toBeNull();
  });
});
