import { SITE_NAME, SITE_TAGLINE } from '@/config/site';
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from '@/lib/og-image';

export const alt = SITE_NAME.he;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

/** Default link preview for every page without its own image. */
export default function Image() {
  return renderOgImage({ title: SITE_NAME.he, subtitle: SITE_TAGLINE.he });
}
