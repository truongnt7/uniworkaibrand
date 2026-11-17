import { generateKeyPairSync, sign } from 'node:crypto';
import type { TrustedKey } from '../src/orchestrator/runtime/trust.js';

export function makeKey(keyId = 'prod-test-1') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trusted: TrustedKey = {
    keyId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    origin: keyId.startsWith('dev-') ? 'dev' : 'production',
  };
  const signText = (text: string) => ({ manifest: text, signature: sign(null, Buffer.from(text), privateKey).toString('base64'), keyId });
  return { trusted, signText, privateKey };
}
