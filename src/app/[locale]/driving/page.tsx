"use client";

import { useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CloudDownload,
  Pause,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useIsDownloaded } from "@/hooks/use-offline";

/* ── Inline SVGs for skip icons (large, high-contrast) ── */

function Skip15BackLarge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5V1L7 5l5 4V5" />
      <path d="M19.07 7.93A8 8 0 1 1 7 5.3" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="bold"
        fontFamily="system-ui"
      >
        15
      </text>
    </svg>
  );
}

function Skip15ForwardLarge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5V1l5 4-5 4V5" />
      <path d="M4.93 7.93A8 8 0 1 0 17 5.3" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="bold"
        fontFamily="system-ui"
      >
        15
      </text>
    </svg>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DrivingModePage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("driving");
  const isRTL = locale === "he";
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    lastNativePlaybackState,
    playbackRecoveryState,
    togglePlay,
    skipForward,
    skipBackward,
    resumePlayback,
  } = useAudioPlayer();
  const currentLessonId = currentTrack?.lessonId || currentTrack?.id || "";
  const isCurrentLessonDownloaded = useIsDownloaded(currentLessonId);
  const showOfflineRecommendation =
    Boolean(currentTrack) && !isCurrentLessonDownloaded;
  const showRecoveryNotice =
    lastNativePlaybackState === "stalled" ||
    lastNativePlaybackState === "waiting" ||
    playbackRecoveryState === "recovering" ||
    playbackRecoveryState === "stalled";

  // Keep screen awake while driving mode is active
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock not supported or permission denied
      }
    }
    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release();
    };
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // No active track state
  if (!currentTrack) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
        style={{
          backgroundColor: "#000",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <p
          className="text-white text-2xl font-bold mb-8"
          dir={isRTL ? "rtl" : "ltr"}
        >
          {t("noActiveLesson")}
        </p>
        <button
          onClick={handleClose}
          className="rounded-full p-4 bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label={t("back")}
        >
          <X className="h-10 w-10" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-[200] flex flex-col"
      style={{
        backgroundColor: "#000",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* ── Top: Track title & series ── */}
      <div
        className="flex-shrink-0 pt-8 pb-4 px-6 text-center"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <h1 className="text-white text-2xl font-bold leading-tight truncate">
          {currentTrack.hebrewTitle || currentTrack.title}
        </h1>
        {currentTrack.seriesName && (
          <p className="text-white/60 text-base mt-1 truncate">
            {currentTrack.seriesName}
          </p>
        )}
      </div>

      {(showOfflineRecommendation ||
        showRecoveryNotice ||
        playbackRecoveryState === "needs-user-gesture") && (
        <div
          className="mx-auto w-full max-w-3xl flex-shrink-0 space-y-2 px-4"
          dir={isRTL ? "rtl" : "ltr"}
        >
          {showOfflineRecommendation && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50"
            >
              <CloudDownload className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200" />
              <span>{t("offlineRecommended")}</span>
            </div>
          )}

          {showRecoveryNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-lg border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-50"
            >
              <RefreshCw className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-200" />
              <span>{t("playbackRecovering")}</span>
            </div>
          )}

          {playbackRecoveryState === "needs-user-gesture" && (
            <button
              type="button"
              onClick={() => {
                void resumePlayback();
              }}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-black transition-transform active:scale-[0.98]"
            >
              <AlertTriangle className="h-5 w-5" />
              <span>{t("tapToResume")}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Middle-top: Time display ── */}
      <div className="flex-shrink-0 text-center py-6">
        <p
          className="text-white font-mono font-bold tabular-nums"
          style={{ fontSize: "2.5rem", lineHeight: 1.2 }}
        >
          {formatTime(currentTime)}
        </p>
        <p className="text-white/40 text-lg font-mono tabular-nums mt-1">
          / {formatTime(duration)}
        </p>
        {/* Simple progress bar */}
        <div className="mx-auto mt-4 w-3/4 max-w-md h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/70 rounded-full transition-[width] duration-300"
            style={{
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%",
            }}
          />
        </div>
      </div>

      {/* ── Center: Main controls ── */}
      <div className="flex-1 flex items-center justify-center">
        <div
          dir="ltr"
          className="flex items-center justify-center gap-3 sm:gap-8 md:gap-10"
        >
          {/* Skip backward */}
          <button
            onClick={() => skipBackward(15)}
            className="rounded-full p-4 bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:p-5"
            aria-label={t("skipBackward")}
          >
            <Skip15BackLarge className="h-12 w-12 sm:h-14 sm:w-14" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-black shadow-2xl transition-transform hover:scale-105 active:scale-95 sm:h-[120px] sm:w-[120px]"
            aria-label={isPlaying ? t("pause") : t("play")}
          >
            {isPlaying ? (
              <Pause className="h-14 w-14 fill-current sm:h-16 sm:w-16" />
            ) : (
              <Play className="ml-1 h-14 w-14 fill-current sm:ml-2 sm:h-16 sm:w-16" />
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skipForward(15)}
            className="rounded-full p-4 bg-white/10 text-white transition-colors hover:bg-white/20 active:bg-white/30 sm:p-5"
            aria-label={t("skipForward")}
          >
            <Skip15ForwardLarge className="h-12 w-12 sm:h-14 sm:w-14" />
          </button>
        </div>
      </div>

      {/* ── Bottom: Close button ── */}
      <div className="flex-shrink-0 flex justify-center pb-10 pt-4">
        <button
          onClick={handleClose}
          className="rounded-full p-4 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          aria-label={t("close")}
        >
          <X className="h-8 w-8" />
        </button>
      </div>
    </div>
  );
}
