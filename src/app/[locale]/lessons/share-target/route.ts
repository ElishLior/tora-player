import { NextResponse, type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';

/**
 * Share target (manifest share_target) when the service worker did not take
 * the POST — e.g. the very first launch before it installed. The files can't
 * be kept here, so open the upload page; with an empty stash it asks the
 * admin to share again. Normally public/sw.js answers this POST itself.
 */
async function openUpload(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const target = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  return NextResponse.redirect(new URL(`/${target}/lessons/upload?shared=1`, request.url), 303);
}

export const GET = openUpload;
export const POST = openUpload;
