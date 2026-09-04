import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

const FALLBACK_KEY_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * Get encryption key from environment variable.
 * Key must be 32 bytes (256 bits) hex-encoded (64 chars).
 * Fallback to deterministic project key if env var is missing or invalid.
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ATM_ENCRYPTION_KEY || FALLBACK_KEY_HEX;
  if (!keyHex || keyHex.length !== 64) {
    return Buffer.from(FALLBACK_KEY_HEX, "hex");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: base64(salt + iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Combine: salt (32) + iv (16) + tag (16) + ciphertext
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  // salt is included for future key derivation support
  void salt;

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Hash a value using SHA-256 (for PII fields sent to Meta).
 * Input is lowercased and trimmed before hashing.
 */
export function sha256Hash(value: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Normalize and hash a phone number for Meta CAPI.
 * Strips all non-digit characters.
 */
export function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return sha256Hash(digits);
}

/**
 * Normalize and hash an email for Meta CAPI.
 */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return "";
  return sha256Hash(normalized);
}

/**
 * Generate a new encryption key (for setup purposes).
 * Call this once to generate the ATM_ENCRYPTION_KEY env var.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Verify HMAC signature (for Shopify webhook validation).
 */
export function verifyHmac(
  body: string,
  signature: string,
  secret: string
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );
}
