'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Shield, Upload, BarChart3, LogOut, BookOpen, ListMusic, Library, FolderTree, Scissors, Bell, Users } from 'lucide-react';
import Link from 'next/link';
import { signOutAndReset } from '@/lib/account/sync';

export default function AdminDashboardPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isRTL = locale === 'he';
  const tNotifications = useTranslations('notifications.admin');
  const tStats = useTranslations('adminStats');
  const tUsers = useTranslations('adminUsers');

  const insightLinks = [
    { href: `/${locale}/admin/stats`, icon: BarChart3, label: tStats('title'), description: tStats('cardDescription') },
    { href: `/${locale}/admin/users`, icon: Users, label: tUsers('title'), description: tUsers('cardDescription') },
  ];

  const adminLinks = [
    {
      href: `/${locale}/lessons/upload`,
      icon: Upload,
      label: isRTL ? 'העלאת שיעור' : 'Upload Lesson',
      description: isRTL ? 'העלאת שיעור חדש עם קבצי שמע ותמונות' : 'Upload a new lesson with audio files and images',
    },
    {
      href: `/${locale}`,
      icon: BookOpen,
      label: isRTL ? 'שיעורים' : 'Lessons',
      description: isRTL ? 'צפייה ועריכת שיעורים קיימים' : 'View and edit existing lessons',
    },
    {
      href: `/${locale}/series`,
      icon: Library,
      label: isRTL ? 'סדרות' : 'Series',
      description: isRTL ? 'ניהול סדרות שיעורים' : 'Manage lesson series',
    },
    {
      href: `/${locale}/admin/categories`,
      icon: FolderTree,
      label: isRTL ? 'קטגוריות' : 'Categories',
      description: isRTL ? 'ניהול קטגוריות ותתי-קטגוריות' : 'Manage categories and subcategories',
    },
    {
      href: `/${locale}/admin/snippets`,
      icon: Scissors,
      label: isRTL ? 'סימוני קטעים' : 'Snippet Markings',
      description: isRTL ? 'צפייה ואישור סימוני קטעים מהמשתמשים' : 'View and approve snippet markings from users',
    },
    {
      href: `/${locale}/playlists`,
      icon: ListMusic,
      label: isRTL ? 'רשימות השמעה' : 'Playlists',
      description: isRTL ? 'ניהול רשימות השמעה' : 'Manage playlists',
    },
    {
      href: `/${locale}/admin/notifications`,
      icon: Bell,
      label: tNotifications('title'),
      description: tNotifications('subtitle'),
    },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {isRTL ? 'לוח בקרה' : 'Admin Dashboard'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'ניהול נגן תורה' : 'Manage Tora Player'}
            </p>
          </div>
        </div>

        <button
          onClick={() => signOutAndReset(`/${locale}`)}
          className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>{isRTL ? 'התנתקות' : 'Logout'}</span>
        </button>
      </div>

      {/* Insights */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        {insightLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4 hover:border-primary/30 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="flex items-center gap-2 text-primary">
              <link.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{link.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
          </Link>
        ))}
      </div>

      {/* Admin Links */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {isRTL ? 'פעולות' : 'Actions'}
        </h2>
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-4 rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4 hover:border-primary/30 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <link.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{link.label}</p>
              <p className="text-sm text-muted-foreground">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
