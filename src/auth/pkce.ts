import { createHash, randomBytes } from 'node:crypto';

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

export function createVerifier(): string {
  return toBase64Url(randomBytes(32));
}

export async function createChallenge(verifier: string): Promise<string> {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

export function createState(): string {
  return toBase64Url(randomBytes(16));
}
