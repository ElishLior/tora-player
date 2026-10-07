# Lesson slug options

Status: **format approved by the owner on October 8, 2026: `<topic>-<DD-MM-YYYY>`** (see "Approved format"). Nothing is implemented yet: no URL, route, migration or lesson row changes. Hebrew display titles stay as they are.

Source: written by Claude Opus 5.5 in the October 7, 2026 session. The app has no AI provider integration, so these were not generated inside the app. Every option uses only the stored title, `parsha`, `date`, tags and description of published lessons (anon read on October 7, 2026: 245 published lessons). No topic or date was added that the record doesn't contain.

Rules for every candidate: lowercase ASCII letters, digits and hyphens; no leading/trailing or double hyphens; ≤ 60 characters. Transliteration follows common Israeli usage (Haazinu, Ki Tavo, Matot-Masei, Tishrei, Etz Chaim).

## Three styles compared

| Style | Example (lesson of 2026-09-18) | For | Against |
|---|---|---|---|
| Transliterated title | `leil-shishi-7-tishrei-5787-haazinu` | Mirrors the Hebrew title; the Hebrew date is kept | Long; most English readers can't parse it |
| English wording | `haazinu-friday-night-2026` | Readable to anyone | Translating "ליל שישי" and topic names adds interpretation; collides every year without a full date |
| Topic + date | `haazinu-2026-09-18` | Short; unique for nearly every full lesson; the date is the stored `date` column, so it never drifts | Gregorian date only |

## Options per sample lesson

Each row: 3–5 candidates, recommended one first.

| Lesson | Stored facts | Candidates |
|---|---|---|
| [`fb296bdf…`](https://tora-player.vercel.app/he/lessons/fb296bdf-9d25-4832-a2d9-262875d48a29) | 2026-09-25 · "ליל שישי - י״ד תשרי תשפ״ז \| חג הסוכות" · parsha סוכות | `sukkot-2026-09-25` · `leil-shishi-14-tishrei-5787-chag-hasukkot` · `sukkot-eve-2026` · `chag-hasukkot-14-tishrei-5787` |
| [`4509463c…`](https://tora-player.vercel.app/he/lessons/4509463c-aaea-4f94-bdab-0e4d92a0d425) | 2026-09-18 · "ליל שישי - ז׳ תשרי תשפ״ז \| פרשת האזינו" | `haazinu-2026-09-18` · `leil-shishi-7-tishrei-5787-haazinu` · `haazinu-friday-night-2026` · `haazinu-7-tishrei-5787` |
| [`88ffb04c…`](https://tora-player.vercel.app/he/lessons/88ffb04c-5707-47aa-8e44-7096b55a0e1b) | 2026-09-24 · "יום חמישי - י״ג תשרי תשפ״ז" · parsha סוכות · tags יחוד החיוורתי, עץ חיים | `sukkot-2026-09-24` · `yom-chamishi-13-tishrei-5787` · `yichud-hachivarti-2026-09-24` · `thursday-13-tishrei-5787` |
| [`e764e1d7…`](https://tora-player.vercel.app/he/lessons/e764e1d7-27e1-4156-bece-521154feb9cc) | 2026-08-23 · "יום ראשון - י׳ אלול תשפ״ו" · parsha כיתבוא · description "יחוד חיוורתי 2 - …" | `ki-tavo-2026-08-23` · `yichud-chivarti-2-2026-08-23` · `yom-rishon-10-elul-5786` · `sunday-10-elul-5786` |
| [`2cb933ef…`](https://tora-player.vercel.app/he/lessons/2cb933ef-351a-4a4b-8538-4503300be1f5) | 2026-07-10 · "ליל שישי - כ״ה תמוז תשפ״ו \| פרשת מטות-מסעי" | `matot-masei-2026-07-10` · `leil-shishi-25-tammuz-5786-matot-masei` · `matot-masei-friday-night-2026` |
| [`ab19cf31…`](https://tora-player.vercel.app/he/lessons/ab19cf31-0be1-4dda-abd0-b3f1c07e6055) (short) | 2026-02-12 · "שורש נשמתינו - האינסוף בפשטות האהבה - חלק 1" | `shoresh-nishmatenu-1-2026-02-12` · `shoresh-nishmatenu-part-1` · `root-of-our-souls-part-1` · `shoresh-nishmatenu-ein-sof-1` |
| [`f7602b35…`](https://tora-player.vercel.app/he/lessons/f7602b35-e3fa-45f7-8711-17eb367e7d3d) (short) | 2026-02-10 · "תורה יד ליקוטי מוהרן" | `likutei-moharan-14-2026-02-10` · `likutei-moharan-torah-14` · `likutei-moharan-teaching-14` |
| [`fda5369b…`](https://tora-player.vercel.app/he/lessons/fda5369b-f7b0-4c6b-82fb-7ba923bdc4ff), [`93d640b8…`](https://tora-player.vercel.app/he/lessons/93d640b8-8dae-4616-8203-7cbd28bda1b7), [`c90d8fff…`](https://tora-player.vercel.app/he/lessons/c90d8fff-1963-449e-9cef-10fc82dd4e27) (three shorts) | 2025-09-12 · all titled "שיעור קצר - 12.09.2025" | `short-2025-09-12`, `short-2025-09-12-2`, `short-2025-09-12-3` · `shiur-katzar-2025-09-12(-2/-3)` |

## Approved format

`<topic>-<DD-MM-YYYY>`, in that order (owner, October 8, 2026). Candidates in the table above that use `YYYY-MM-DD` are superseded by this format.

- **Topic, full lesson:** the transliterated reading from `lessons.parsha`, or the holiday name.
- **Topic, short lesson:** its transliterated title, without any date or name the title already contains.
- **Date:** the stored `date` column, written day-month-year. It is never parsed from the displayed Hebrew date.
- **Collisions:** `-2`, `-3` after the date, in `created_at` order.
- **Review:** an admin confirms each generated slug before it is saved.

| Lesson | Slug |
|---|---|
| `fb296bdf…` 2026-09-25, חג הסוכות | `sukkot-25-09-2026` |
| `4509463c…` 2026-09-18, פרשת האזינו | `haazinu-18-09-2026` |
| `88ffb04c…` 2026-09-24, parsha סוכות | `sukkot-24-09-2026` |
| `e764e1d7…` 2026-08-23, parsha כיתבוא | `ki-tavo-23-08-2026` |
| `2cb933ef…` 2026-07-10, פרשת מטות-מסעי | `matot-masei-10-07-2026` |
| `ab19cf31…` short, שורש נשמתינו חלק 1 | `shoresh-nishmatenu-1-12-02-2026` |
| `f7602b35…` short, תורה יד ליקוטי מוהרן | `likutei-moharan-14-10-02-2026` |
| `fda5369b…`, `93d640b8…`, `c90d8fff…` three shorts on 2025-09-12 | `short-12-09-2025`, `short-12-09-2025-2`, `short-12-09-2025-3` |

A topic that ends in a number puts that number right before the date (`likutei-moharan-14-10-02-2026`). If that reads badly, an admin can add a word to the topic (`likutei-moharan-torah-14-10-02-2026`).

## Publication path (only after approval)

1. **Stable identity.** The lesson UUID stays the primary key. RSS GUIDs (`lesson_audio.id`), progress, bookmarks and notes keep using IDs.
2. **Storage.** Add a nullable `lessons.slug` column with a unique index, plus a `lesson_slug_history(slug primary key, lesson_id)` table, so a renamed slug keeps redirecting.
3. **Collisions.** Collisions are resolved when a slug is assigned:
   - If the slug is already taken, append `-2`, `-3`, and so on, in `created_at` order.
   - Once a slug is saved it never changes because of another lesson.
4. **Routing.** `/[locale]/lessons/[lessonId]` accepts either a UUID or a slug.
   - A UUID with a slug 301-redirects to the slug URL.
   - An old slug from history 301-redirects to the current one.
   - Unknown values return 404.
   - Every existing `/he/lessons/<uuid>` link keeps working.
5. **Canonical.**
   - `lessonPath()`/`lessonUrl()` in `src/config/site.ts` return the slug URL when there is one, so canonical tags, the sitemap, RSS links and share links change in one place.
   - `generateMetadata` sets the canonical to the slug URL.
6. **Rollout.** Ship the code first with no slugs set (no visible change). Then fill slugs in reviewed batches through the admin edit page, which calls `revalidateCatalog()`.

## Data observations (not changed)

- Lesson [`edebab64…`](https://tora-player.vercel.app/he/lessons/edebab64-186d-4ed5-9898-dbefe0c47b3c) (2025-09-12) is titled "פרשת האזינו". 19 Elul 5785 falls in Ki Tavo week, and the three short lessons from the same day store `כיתבוא`. A content admin should check it before any slug uses its reading.
- Lessons `0a404d1f…` and `1ef17b70…` (2026-02-24) have identical titles. They may be duplicates.

## Out of scope

AI knowledge graphs, OCR and book indexing are separate future work. This proposal adds no provider, dependency or schema.
