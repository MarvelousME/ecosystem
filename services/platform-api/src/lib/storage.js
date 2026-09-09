import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export class LocalObjectStorageProvider {
  constructor(baseDir) {
    this.baseDir = baseDir || process.env.BRIDGE_QUARANTINE_DIR || path.join(process.cwd(), '.quarantine');
  }

  async put(key, buffer) {
    const fullPath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { provider: 'local', key, path: fullPath };
  }

  async get(key) {
    const fullPath = path.join(this.baseDir, key);
    return fs.readFile(fullPath);
  }
}

export class S3ObjectStorageProvider {
  constructor() {
    this.bucket = process.env.S3_BUCKET || 'bridge-artifacts';
    const config = {
      region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1'
    };
    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    }
    if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      };
    }
    this.client = new S3Client(config);
  }

  async put(key, buffer) {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer
    }));
    return { provider: 's3', bucket: this.bucket, key };
  }

  async get(key) {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
}

export function getObjectStorage() {
  const provider = process.env.BRIDGE_OBJECT_STORAGE_PROVIDER;
  if (provider === 's3') {
    return new S3ObjectStorageProvider();
  }
  return new LocalObjectStorageProvider();
}
