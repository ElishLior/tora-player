import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { deleteFromR2, uploadToR2 } from '@/lib/r2';
import { sniffImage } from '@/lib/image-sniff';
import { getImageStreamUrl } from '@/lib/image-keys';
import { createGalleryThumbnail, thumbKeyFor, type GalleryThumbnail } from '@/lib/image-thumbs';
import { lessonExists, rejectNonAdmin, UUID_RE } from '@/lib/upload-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Vercel caps request bodies at ~4.5 MB; the client downsizes larger photos.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Upload one image for an existing lesson (multipart: file, lessonId, sortOrder).
 * The format comes from the file's magic bytes, never from the client MIME type.
 * A WebP gallery thumbnail is stored next to it (`…/thumbs/<name>.webp`) and the
 * row records the thumbnail key and the original's displayed dimensions.
 */
export async function POST(request: NextRequest) {
  const denied = await rejectNonAdmin();
  if (denied) return denied;

  const uploadedKeys: string[] = [];
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const lessonId = formData.get('lessonId');
    const sortOrder = Number(formData.get('sortOrder') || 0);

    if (!(file instanceof File) || typeof lessonId !== 'string' || !UUID_RE.test(lessonId) ||
      !Number.isInteger(sortOrder) || sortOrder < 0) {
      return NextResponse.json({ error: 'Invalid image request' }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const image = sniffImage(buffer);
    if (!image) {
      return NextResponse.json({ error: 'Unsupported image format (JPEG, PNG, WebP or GIF only)' }, { status: 415 });
    }
    let rendition: GalleryThumbnail;
    try {
      rendition = await createGalleryThumbnail(buffer);
    } catch {
      return NextResponse.json({ error: 'Unreadable image' }, { status: 415 });
    }
    if (!(await lessonExists(lessonId))) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const fileKey = `images/${lessonId}/${sortOrder}_${Date.now()}.${image.ext}`;
    const thumbKey = thumbKeyFor(fileKey);
    await uploadToR2(fileKey, buffer, image.mime);
    uploadedKeys.push(fileKey);
    await uploadToR2(thumbKey, rendition.thumb, 'image/webp');
    uploadedKeys.push(thumbKey);

    const imageUrl = getImageStreamUrl(fileKey);
    const { data: imageRecord, error: dbError } = await createAdminSupabaseClient()
      .from('lesson_images')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        thumb_key: thumbKey,
        image_url: imageUrl,
        source_filename: file.name.slice(0, 255),
        file_size: buffer.length,
        width: rendition.width,
        height: rendition.height,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (dbError) throw dbError;

    return NextResponse.json({ success: true, fileKey, imageUrl, imageRecord });
  } catch (error) {
    console.error('Image upload error:', error);
    for (const key of uploadedKeys) {
      try { await deleteFromR2(key); } catch { /* best effort */ }
    }
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}
