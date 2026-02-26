import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${(process.env.R2_ACCOUNT_ID || '').trim()}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

const BUCKET = (process.env.R2_BUCKET_NAME || 'tora-player-audio').trim();

export async function getUploadPresignedUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

export async function getDownloadPresignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: 7200 });
}

export async function uploadToR2(key: string, body: Buffer | Uint8Array, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await r2Client.send(command);
}

export async function deleteFromR2(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await r2Client.send(command);
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  const response = await r2Client.send(command);
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function listR2Objects(prefix: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
  });
  const response = await r2Client.send(command);
  return (response.Contents || []).map((obj) => obj.Key!).sort();
}

export async function deleteR2Prefix(prefix: string) {
  const keys = await listR2Objects(prefix);
  if (keys.length === 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });
  await r2Client.send(command);
}

export function getPublicAudioUrl(key: string): string {
  // Always use the stream API which generates signed download URLs
  // Direct R2 URLs require authentication and won't work from the browser
  return `/api/audio/stream/${encodeURIComponent(key)}`;
}

export async function configureBucketCors(allowedOrigins: string[] = ['*']) {
  const command = new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedOrigins: allowedOrigins,
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  });
  await r2Client.send(command);
}

export function generateAudioKey(lessonId: string, format: string = 'mp3'): string {
  return `audio/${lessonId}/lesson.${format}`;
}

export function generateOriginalKey(lessonId: string, originalName: string): string {
  const ext = originalName.split('.').pop() || 'bin';
  return `originals/${lessonId}/original.${ext}`;
}

// ─── S3 Multipart Upload API ───────────────────────────────────────

export interface MultipartPart {
  ETag: string;
  PartNumber: number;
}

/**
 * Create a multipart upload session. Returns an uploadId to use with uploadPart/complete/abort.
 */
export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const command = new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const response = await r2Client.send(command);
  if (!response.UploadId) throw new Error('Failed to create multipart upload — no UploadId returned');
  return response.UploadId;
}

/**
 * Upload a single part of a multipart upload. Returns an ETag.
 * R2 requires minimum 5MB per part (except the last one).
 */
export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer | Uint8Array,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: body,
  });
  const response = await r2Client.send(command);
  if (!response.ETag) throw new Error(`uploadPart returned no ETag for part ${partNumber}`);
  return response.ETag;
}

/**
 * Complete a multipart upload by providing the list of parts.
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: MultipartPart[],
): Promise<void> {
  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber })),
    },
  });
  await r2Client.send(command);
}

/**
 * Abort a multipart upload (cleanup on error).
 */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: BUCKET,
    Key: key,
    UploadId: uploadId,
  });
  await r2Client.send(command);
}
