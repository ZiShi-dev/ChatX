import { createHash, createSign, createVerify, type KeyObject } from 'node:crypto';

type Key = string | KeyObject;

export function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function signBytes(bytes: Buffer | string, privateKey: Key) {
  const sign = createSign('RSA-SHA256');
  sign.update(bytes);
  sign.end();
  return sign.sign(privateKey).toString('base64');
}

export function verifyBytes(bytes: Buffer | string, signature: string, publicKey: Key) {
  try {
    const verify = createVerify('RSA-SHA256');
    verify.update(bytes);
    verify.end();
    return verify.verify(publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/** Signed description of a web bundle. Keep identical to src/lib/appRelease.ts. */
export function webCanonical(input: { bundleId: string; checksum: string; nativeVersionCode: number; publishedAt: number; path: string; signature: string }) {
  return `chatx-web-v1\n${input.bundleId}\n${input.checksum}\n${input.nativeVersionCode}\n${input.publishedAt}\n${input.path}\n${input.signature}\n`;
}

/** Signed description of an APK. Keep identical to src/lib/appRelease.ts. */
export function apkCanonical(input: { versionCode: number; versionName: string; sha256: string; path: string; signature: string }) {
  return `chatx-apk-v1\n${input.versionCode}\n${input.versionName}\n${input.sha256}\n${input.path}\n${input.signature}\n`;
}
