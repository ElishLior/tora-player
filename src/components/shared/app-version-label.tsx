'use client';

import { useTranslations } from 'next-intl';
import { useDeployedVersion } from '@/hooks/use-deployed-version';
import { APP_VERSION, BUILD_ID, buildsDiffer, shortBuildId } from '@/lib/app-version';

/**
 * "גרסה 1.2.0 · 7kYaUUV": the build this bundle was made from (baked in, never
 * the server's answer). Once the live site's build arrives too, it shows both:
 * "פועלת: 1.2.0 · 7kYaUUV · באתר: 1.2.0 · 9xQw3Lp", marked when they differ.
 */
export function AppVersionLabel({ className }: { className?: string }) {
  const t = useTranslations('appUpdate');
  const deployed = useDeployedVersion();

  if (!deployed) {
    return (
      <p className={className}>
        <bdi>{t('versionLabel', { version: APP_VERSION, build: shortBuildId() })}</bdi>
      </p>
    );
  }

  const differs = buildsDiffer({ version: APP_VERSION, buildId: BUILD_ID }, deployed);
  return (
    <p className={className}>
      <bdi>
        {t('runningAndDeployed', {
          running: `${APP_VERSION} · ${shortBuildId(BUILD_ID)}`,
          deployed: `${deployed.version} · ${shortBuildId(deployed.buildId)}`,
        })}
      </bdi>
      {differs && (
        <>
          {' '}
          <bdi>{t('versionDiffers')}</bdi>
        </>
      )}
    </p>
  );
}
