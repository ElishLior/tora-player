import { AlertTriangle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { ReloadButton } from '@/components/shared/reload-button';

/**
 * A list whose catalog read failed: an error block with a "try again" control.
 * Distinct from the true-empty state, so a failed read never looks like "no lessons".
 * Server component; the reload itself is the client ReloadButton.
 */
export async function ListLoadError() {
  const t = await getTranslations('desktopShell');
  return (
    <div role="alert">
      <EmptyState
        icon={AlertTriangle}
        title={t('errorTitle')}
        description={t('errorHint')}
        action={<ReloadButton label={t('retry')} />}
      />
    </div>
  );
}
