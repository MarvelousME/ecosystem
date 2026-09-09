/**
 * ISecretEncryptionProvider — lab AES-GCM + AWS KMS envelope encryption.
 * Plaintext data keys are zeroed after use; never persisted.
 */
import crypto from 'node:crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand, DescribeKeyCommand } from '@aws-sdk/client-kms';

const ALGO = 'aes-256-gcm';

function zeroBuffer(buf) {
  if (buf && Buffer.isBuffer(buf)) buf.fill(0);
}

function labKeyBytes() {
  const raw = process.env.BRIDGE_SECRETS_KEY || '';
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function aesGcmEncrypt(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext: enc };
}

function aesGcmDecrypt(ciphertext, key, iv, tag) {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export class LabAesGcmSecretProvider {
  constructor() {
    this.id = 'lab';
  }

  async health() {
    const configured = Boolean(process.env.BRIDGE_SECRETS_KEY);
    return {
      provider: this.id,
      status: configured ? 'ready' : 'degraded',
      kms: { status: 'not_applicable' }
    };
  }

  async seal(plaintext, context = {}) {
    const key = labKeyBytes();
    if (!key) {
      return {
        ciphertext: Buffer.from(String(plaintext), 'utf8').toString('base64'),
        meta: {
          provider: this.id,
          enc: 'lab-b64',
          note: 'set BRIDGE_SECRETS_KEY for AES-GCM',
          context
        }
      };
    }
    const { iv, tag, ciphertext } = aesGcmEncrypt(plaintext, key);
    zeroBuffer(key);
    const blob = Buffer.concat([iv, tag, ciphertext]).toString('base64');
    return {
      ciphertext: blob,
      meta: {
        provider: this.id,
        enc: ALGO,
        v: 1,
        context: { ...context, purpose: context.purpose || 'bridge-secret' }
      }
    };
  }

  async open(ciphertext, meta = {}) {
    if (meta?.enc === 'lab-b64' || (!meta?.enc && !labKeyBytes())) {
      return Buffer.from(ciphertext, 'base64').toString('utf8');
    }
    const key = labKeyBytes();
    if (!key) throw new Error('BRIDGE_SECRETS_KEY required to open sealed secret');
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    try {
      return aesGcmDecrypt(data, key, iv, tag);
    } finally {
      zeroBuffer(key);
    }
  }
}

export class AwsKmsSecretProvider {
  /**
   * @param {{ client?: import('@aws-sdk/client-kms').KMSClient, keyId?: string }} [opts]
   */
  constructor(opts = {}) {
    this.id = 'aws-kms';
    this.keyId = opts.keyId || process.env.BRIDGE_KMS_KEY_ID || '';
    this.client =
      opts.client ||
      new KMSClient({
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
      });
  }

  encryptionContext(context = {}) {
    const ctx = {
      purpose: String(context.purpose || 'bridge-secret'),
      secretName: String(context.secretName || context.name || 'unnamed')
    };
    if (context.tenantId) ctx.tenantId = String(context.tenantId);
    if (context.appId || context.applicationId) ctx.appId = String(context.appId || context.applicationId);
    return ctx;
  }

  async health() {
    if (!this.keyId) {
      return {
        provider: this.id,
        status: 'misconfigured',
        kms: { status: 'missing_key_id', key: null }
      };
    }
    try {
      const out = await this.client.send(new DescribeKeyCommand({ KeyId: this.keyId }));
      const keyArn = out.KeyMetadata?.Arn || this.keyId;
      return {
        provider: this.id,
        status: 'ready',
        kms: {
          status: 'ok',
          key: keyArn.replace(/^(arn:aws:kms:[^:]+:\d+:key\/).+$/, '$1***')
        }
      };
    } catch (e) {
      return {
        provider: this.id,
        status: 'unavailable',
        kms: { status: 'error', key: this.keyId.slice(0, 12) + '***', detail: e.name || 'error' }
      };
    }
  }

  async seal(plaintext, context = {}) {
    if (!this.keyId) throw new Error('BRIDGE_KMS_KEY_ID required for aws-kms provider');
    const encCtx = this.encryptionContext(context);
    const dk = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: 'AES_256',
        EncryptionContext: encCtx
      })
    );
    const dataKey = Buffer.from(dk.Plaintext);
    try {
      const { iv, tag, ciphertext } = aesGcmEncrypt(plaintext, dataKey);
      return {
        ciphertext: ciphertext.toString('base64'),
        meta: {
          provider: this.id,
          enc: ALGO,
          v: 1,
          kmsKeyId: this.keyId,
          encryptedDataKey: Buffer.from(dk.CiphertextBlob).toString('base64'),
          iv: iv.toString('base64'),
          tag: tag.toString('base64'),
          context: encCtx
        }
      };
    } finally {
      zeroBuffer(dataKey);
      if (dk.Plaintext) {
        if (Buffer.isBuffer(dk.Plaintext)) zeroBuffer(dk.Plaintext);
        else if (dk.Plaintext instanceof Uint8Array) dk.Plaintext.fill(0);
      }
    }
  }

  async open(ciphertext, meta = {}) {
    if (!meta?.encryptedDataKey) throw new Error('aws-kms open requires encryptedDataKey in meta');
    const encCtx = meta.context || this.encryptionContext(meta);
    const dec = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(meta.encryptedDataKey, 'base64'),
        EncryptionContext: encCtx
      })
    );
    const dataKey = Buffer.from(dec.Plaintext);
    try {
      const data = Buffer.from(ciphertext, 'base64');
      const iv = Buffer.from(meta.iv, 'base64');
      const tag = Buffer.from(meta.tag, 'base64');
      return aesGcmDecrypt(data, dataKey, iv, tag);
    } finally {
      zeroBuffer(dataKey);
      if (dec.Plaintext) {
        if (Buffer.isBuffer(dec.Plaintext)) zeroBuffer(dec.Plaintext);
        else if (dec.Plaintext instanceof Uint8Array) dec.Plaintext.fill(0);
      }
    }
  }
}

let cachedProvider;

export function resolveSecretsProviderName() {
  const explicit = (process.env.BRIDGE_SECRETS_PROVIDER || '').toLowerCase();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === 'production') return 'aws-kms';
  return 'lab';
}

export function createSecretsProvider(opts = {}) {
  const name = opts.provider || resolveSecretsProviderName();
  if (name === 'aws-kms') return new AwsKmsSecretProvider(opts);
  if (name === 'lab') return new LabAesGcmSecretProvider();
  throw new Error(`Unknown BRIDGE_SECRETS_PROVIDER: ${name}`);
}

export function getSecretsProvider(opts = {}) {
  if (!cachedProvider || opts.forceNew) {
    cachedProvider = createSecretsProvider(opts);
  }
  return cachedProvider;
}

export function secretsConfigured() {
  const name = resolveSecretsProviderName();
  if (name === 'aws-kms') return Boolean(process.env.BRIDGE_KMS_KEY_ID);
  return Boolean(process.env.BRIDGE_SECRETS_KEY);
}

/** Assert production does not silently use lab crypto. */
export function assertSecretsProductionPolicy() {
  const name = resolveSecretsProviderName();
  const isProd = process.env.NODE_ENV === 'production';
  const allowLab = process.env.BRIDGE_ALLOW_LAB_SECRETS_IN_PROD === '1';
  if (isProd && name === 'lab' && !allowLab) {
    throw new Error(
      'Production refuses BRIDGE_SECRETS_PROVIDER=lab. Set aws-kms or BRIDGE_ALLOW_LAB_SECRETS_IN_PROD=1 (emergency only).'
    );
  }
  if (isProd && name === 'lab' && allowLab) {
    console.error('[SECURITY] WARNING: lab secrets provider enabled in production via emergency override');
  }
  if (isProd && name === 'aws-kms' && !process.env.BRIDGE_KMS_KEY_ID) {
    throw new Error('BRIDGE_KMS_KEY_ID required when BRIDGE_SECRETS_PROVIDER=aws-kms in production');
  }
}

/** Back-compat facade used by existing routes. */
export async function sealSecret(plaintext, context = {}) {
  return getSecretsProvider().seal(plaintext, context);
}

export async function openSecret(ciphertext, meta = {}) {
  const providerName = meta?.provider || resolveSecretsProviderName();
  const provider = createSecretsProvider({ provider: providerName });
  return provider.open(ciphertext, meta);
}

export async function secretsHealth() {
  try {
    return await getSecretsProvider().health();
  } catch (e) {
    return { provider: resolveSecretsProviderName(), status: 'error', detail: e.message };
  }
}
