"use client";

import { useCallback, useEffect } from "react";
import {
  AlertTriangle,
  CloudDownload,
  RefreshCw,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useIsDownloaded } from "@/hooks/use-offline";
import { PlayPauseIcon, SkipButton } from "@/components/player/player-controls";
import { formatDuration } from "@/lib/utils";

const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 0.75];

/** Keeps the screen on while driving mode is visible (released automatically when hidden). */
function useScreenWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let active = true;

    const request = async () => {
      if (document.visibilityState !== "visible" || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (!active) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          sentinel = null;
        });
      } catch {
        // Denied (e.g. battery saver); the screen may dim normally.
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release();
    };
  }, []);
}

export default function DrivingModePage() {
  const router = useRouter();
  const t = useTranslations("driving");
  const tPlayer = useTranslations("player");
  const {
    currentTrack,
    currentTime,
    duration,
    playbackSpeed,
    playbackIssue,
    transport,
    hasNextTrack,
    hasPreviousTrack,
    togglePlay,
    skipForward,
    skipBackward,
    nextTrack,
    previousTrack,
    setPlaybackSpeed,
  } = useAudioPlayer();
  const isCurrentLessonDownloaded = useIsDownloaded(
    currentTrack?.lessonId || currentTrack?.id || "",
  );

  useScreenWakeLock();

  const handleClose = useCallback(() => router.back(), [router]);

  const cycleSpeed = () => {
    const index = SPEED_STEPS.indexOf(playbackSpeed);
    setPlaybackSpeed(SPEED_STEPS[(index + 1) % SPEED_STEPS.length]);
  };

  const shellStyle = {
    backgroundColor: "#000",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingInlineStart: "env(safe-area-inset-left)",
    paddingInlineEnd: "env(safe-area-inset-right)",
  };

  const closeButton = (
    <button
      type="button"
      onClick={handleClose}
      className="rounded-full p-4 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
      aria-label={t("close")}
    >
      <X className="h-8 w-8" />
    </button>
  );

  if (!currentTrack) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 px-6 text-center"
        style={shellStyle}
      >
        <p className="text-white text-2xl font-bold">{t("noActiveLesson")}</p>
        <Link
          href="/lessons"
          className="rounded-full bg-white px-6 py-3 text-lg font-bold text-black"
        >
          {t("browseLessons")}
        </Link>
        {closeButton}
      </div>
    );
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-[200] flex flex-col"
      style={shellStyle}
    >
      {/* Title */}
      <div className="flex-shrink-0 px-6 pt-8 pb-4 text-center">
        <h1 className="text-white text-2xl font-bold leading-tight line-clamp-2" dir="auto">
          {currentTrack.hebrewTitle || currentTrack.title}
        </h1>
        {currentTrack.seriesName && (
          <p className="text-white/60 text-base mt-1 truncate" dir="auto">
            {currentTrack.seriesName}
          </p>
        )}
      </div>

      {(playbackIssue || !isCurrentLessonDownloaded) && (
        <div className="mx-auto w-full max-w-3xl flex-shrink-0 space-y-2 px-4">
          {playbackIssue && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-start gap-3 rounded-lg border border-sky-400/25 bg-sky-400/10 px-4 py-3 text-base leading-6 text-sky-50"
            >
              {playbackIssue === "retrying" ? (
                <RefreshCw className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-sky-200" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200" />
              )}
              <span>{tPlayer(`issue.${playbackIssue}`)}</span>
            </div>
          )}
          {!playbackIssue && !isCurrentLessonDownloaded && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-50">
              <CloudDownload className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200" />
              <span>{t("offlineRecommended")}</span>
            </div>
          )}
        </div>
      )}

      {/* Position */}
      <div className="flex-shrink-0 px-6 py-6 text-center">
        <p className="text-white font-mono font-bold tabular-nums text-[2.5rem] leading-tight">
          <bdi>{formatDuration(currentTime)}</bdi>
        </p>
        <p className="text-white/40 text-lg font-mono tabular-nums mt-1">
          <bdi>{duration > 0 ? formatDuration(duration) : "--:--"}</bdi>
        </p>
        <div className="mx-auto mt-4 h-1.5 w-3/4 max-w-md overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/70 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Transport: back → play → forward; in Hebrew "back" sits on the right. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <div className="flex items-center justify-center gap-4 sm:gap-10">
          <SkipButton
            direction="back"
            onClick={skipBackward}
            className="rounded-full bg-white/10 p-4 text-white hover:bg-white/20 active:bg-white/30 sm:p-5"
            iconClassName="h-12 w-12 sm:h-14 sm:w-14"
            labelClassName="text-base"
          />

          <button
            type="button"
            onClick={togglePlay}
            className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-black shadow-2xl transition-transform active:scale-95 sm:h-32 sm:w-32"
            aria-label={transport === "paused" ? t("play") : t("pause")}
          >
            <PlayPauseIcon transport={transport} className="h-14 w-14 sm:h-16 sm:w-16" />
          </button>

          <SkipButton
            direction="forward"
            onClick={skipForward}
            className="rounded-full bg-white/10 p-4 text-white hover:bg-white/20 active:bg-white/30 sm:p-5"
            iconClassName="h-12 w-12 sm:h-14 sm:w-14"
            labelClassName="text-base"
          />
        </div>

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={previousTrack}
            disabled={!hasPreviousTrack}
            className="rounded-full bg-white/10 p-4 text-white hover:bg-white/20 disabled:opacity-25"
            aria-label={t("previousLesson")}
          >
            <SkipBack className="h-8 w-8 fill-current rtl:-scale-x-100" />
          </button>

          <button
            type="button"
            onClick={cycleSpeed}
            className="min-w-[5.5rem] rounded-full border-2 border-white/30 px-5 py-3 text-xl font-bold tabular-nums text-white"
            aria-label={t("speed", { speed: playbackSpeed })}
          >
            <bdi>{playbackSpeed}x</bdi>
          </button>

          <button
            type="button"
            onClick={nextTrack}
            disabled={!hasNextTrack}
            className="rounded-full bg-white/10 p-4 text-white hover:bg-white/20 disabled:opacity-25"
            aria-label={t("nextLesson")}
          >
            <SkipForward className="h-8 w-8 fill-current rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <div className="flex flex-shrink-0 justify-center pb-10 pt-4">{closeButton}</div>
    </div>
  );
}
