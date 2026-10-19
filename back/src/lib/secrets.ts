import crypto from "crypto";

function key(purpose: string) {
  const seed = process.env.APP_SECRETS_ENCRYPTION_KEY || process.env.JWT_SECRET || "pixel-grafica-dev";
  return crypto.createHash("sha256").update(`${purpose}:${seed}`).digest();
}

export function encryptSecret(value: string, purpose: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined, purpose: string): string | null {
  if (!value) return null;
  try {
    const [v, iv, tag, enc] = value.split(":");
    if (v !== "v1" || !iv || !tag || !enc) return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
