import { NextRequest, NextResponse } from 'next/server';
import { requireServerSupabaseClient } from '@/lib/supabase/server';
import { uploadToR2 } from '@/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Upload a single image for a lesson.
 * Stores the image in R2 under images/{lessonId}/ and creates a lesson_images record.
 *
 * Accepts multipart form data:
 *   - file: the image file
 *   - lessonId: the lesson UUID
 *   - sortOrder: optional sort position (defaults to 0)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const lessonId = formData.get('lessonId') as string | null;
    const sortOrder = Number(formData.get('sortOrder') || 0);

    if (!file || !lessonId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, lessonId' },
        { status: 400 }
      );
    }

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      );
    }

    // Max 20MB for images
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image too large. Maximum 20MB.' },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine extension from content type
    const ext = file.type.split('/').pop()?.replace('jpeg', 'jpg') || 'jpg';
    const fileKey = `images/${lessonId}/${sortOrder}_${Date.now()}.${ext}`;

    // Upload to R2
    await uploadToR2(fileKey, buffer, file.type);

    // Create image URL (via streaming proxy)
    const imageUrl = `/api/images/stream/${encodeURIComponent(fileKey)}`;

    // Record in database
    const supabase = await requireServerSupabaseClient();
    const { data: imageRecord, error: dbError } = await supabase
      .from('lesson_images')
      .insert({
        lesson_id: lessonId,
        file_key: fileKey,
        image_url: imageUrl,
        original_name: file.name,
        file_size: file.size,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB error creating lesson_image:', dbError);
      return NextResponse.json(
        { error: 'Image uploaded but failed to save record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fileKey,
      imageUrl,
      imageRecord,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}
