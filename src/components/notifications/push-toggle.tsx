'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';

interface SwitchProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

/** Accessible on/off switch; the knob sits at the inline end when on, so it mirrors in RTL. */
export function Switch({ checked, disabled, label, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
        checked ? 'justify-end bg-primary' : 'justify-start bg-muted-foreground/30'
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow" />
    </button>
  );
}

/**
 * "Notifications on this device" row with the explanation for the states
 * where a switch alone can't help (iOS Safari tab, blocked, unsupported).
 */
export function PushToggle() {
  const t = useTranslations('notifications');
  const tAccount = useTranslations('auth.account');
  const { status, busy, error, enable, disable } = usePushNotifications();

  const explanation =
    status === 'ios-install'
      ? t('iosInstall')
      : status === 'denied'
        ? t('denied')
        : status === 'unavailable'
          ? t('unavailable')
          : error === 'sw-timeout'
            ? t('errors.swTimeout')
            : error
              ? t('errors.failed')
              : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">{tAccount('pushToggle')}</p>
          {(status === 'on' || status === 'off') && (
            <p className="text-xs text-muted-foreground">{status === 'on' ? t('on') : t('off')}</p>
          )}
        </div>
        {status === 'checking' || busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={status === 'on'}
            disabled={status !== 'on' && status !== 'off'}
            label={tAccount('pushToggle')}
            onChange={(checked) => void (checked ? enable() : disable())}
          />
        )}
      </div>
      {explanation && <p className="text-xs leading-relaxed text-muted-foreground">{explanation}</p>}
    </div>
  );
}
