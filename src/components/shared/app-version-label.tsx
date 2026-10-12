import { useTranslations } from 'next-intl';
import { APP_VERSION, shortBuildId } from '@/lib/app-version';

/**
 * "גרסה 1.2.0 · 7kYaUUV": the build this bundle was made from (baked in, never
 * the server's answer). Safe to render on the server and in client components.
 */
export function AppVersionLabel({ className }: { className?: string }) {
  const t = useTranslations('appUpdate');
  return (
    <p className={className}>
      <bdi>{t('versionLabel', { version: APP_VERSION, build: shortBuildId() })}</bdi>
    </p>
  );
}
