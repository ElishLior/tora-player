'use client';

import { useParams, useRouter } from 'next/navigation';
import { Shield, Upload, BarChart3, LogOut, BookOpen, ListMusic, Library } from 'lucide-react';
import Link from 'next/link';
import { logoutAdmin } from '@/actions/auth';

export default function AdminDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;
  const isRTL = locale === 'he';

  async function handleLogout() {
    await logoutAdmin();
    router.push(`/${locale}`);
    router.refresh();
  }

  const adminLinks = [
    {
      href: `/${locale}/admin/stats`,
      icon: BarChart3,
      label: isRTL ? 'סטטיסטיקות' : 'Statistics',
      description: isRTL ? 'צפייה בנתוני שימוש וסטטיסטיקות' : 'View usage data and statistics',
    },
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
      href: `/${locale}/playlists`,
      icon: ListMusic,
      label: isRTL ? 'רשימות השמעה' : 'Playlists',
      description: isRTL ? 'ניהול רשימות השמעה' : 'Manage playlists',
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
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>{isRTL ? 'התנתקות' : 'Logout'}</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <Link
          href={`/${locale}/admin/stats`}
          className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4 hover:border-primary/30 hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <div className="flex items-center gap-2 text-primary">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-medium">{isRTL ? 'סטטיסטיקות' : 'Statistics'}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRTL ? 'צפה בנתונים' : 'View data'}
          </p>
        </Link>
        <div className="rounded-xl border border-border/50 bg-[hsl(var(--surface-elevated))] p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Upload className="h-4 w-4" />
            <span className="text-xs">{isRTL ? 'העלאות אחרונות' : 'Recent Uploads'}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground/60">
            {isRTL ? 'בקרוב...' : 'Coming soon...'}
          </p>
        </div>
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
