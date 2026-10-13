import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  downloadFromR2,
  uploadPart,
  uploadToR2,
  type MultipartPart,
} from '@/lib/r2';

/*
 * Chunked admin uploads: the browser sends 3.5 MB chunks to /api/upload/chunk
 * (each parked in R2 under _chunks/<uploadId>/), then a completion route joins
 * them here into the final object. Used by audio and lesson-source PDFs.
 */

// Files under this size are concatenated in memory; larger ones go through
// S3 multipart so memory stays at ~one part.
const SIMPLE_THRESHOLD = 10 * 1024 * 1024;
// R2/S3 minimum part size for multipart upload (except the last part)
const MIN_PART_SIZE = 5 * 1024 * 1024;

/** Join the parked chunks (in key order) into `fileKey`; returns the stored byte count. */
export async function assembleChunks(chunkKeys: string[], fileKey: string, contentType: string, fileSize: number) {
  if (fileSize < SIMPLE_THRESHOLD) {
    const chunks: Buffer[] = [];
    for (const key of chunkKeys) chunks.push(await downloadFromR2(key));
    const completeFile = Buffer.concat(chunks);
    await uploadToR2(fileKey, completeFile, contentType);
    return completeFile.length;
  }

  const mpUploadId = await createMultipartUpload(fileKey, contentType);
  const parts: MultipartPart[] = [];
  let actualSize = 0;
  try {
    let accumulated = Buffer.alloc(0);
    for (let i = 0; i < chunkKeys.length; i++) {
      const chunkData = await downloadFromR2(chunkKeys[i]);
      actualSize += chunkData.length;
      accumulated = Buffer.concat([accumulated, chunkData]);
      if (accumulated.length >= MIN_PART_SIZE || i === chunkKeys.length - 1) {
        const partNumber = parts.length + 1;
        const etag = await uploadPart(fileKey, mpUploadId, partNumber, accumulated);
        parts.push({ ETag: etag, PartNumber: partNumber });
        accumulated = Buffer.alloc(0);
      }
    }
    await completeMultipartUpload(fileKey, mpUploadId, parts);
  } catch (error) {
    try { await abortMultipartUpload(fileKey, mpUploadId); } catch { /* already failing */ }
    throw error;
  }
  return actualSize;
}

