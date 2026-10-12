import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import heMessages from '../../../messages/he.json';
import { lessonUrl, localePath, lessonPath, pageUrl } from '@/config/site';
import { planAnnouncement, renderAnnouncement, type AnnouncedPart } from './announcement';
import type { AnnouncedLesson } from './batch-rules';

const tParts = createTranslator({ locale: 'he', messages: heMessages, namespace: 'partDurations' });
const t = createTranslator({ locale: 'he', messages: heMessages, namespace: 'notifications' });

const lesson = (id: string, date: string, title = `שיעור ${id}`, isShort = false): AnnouncedLesson => ({
  id,
  slug: `${id}-slug`,
  title,
  date,
  hebrewDate: null,
  isShort,
});
const part = (id: string, lessonId: string, sortOrder: number, duration: number | null): AnnouncedPart => ({
  id,
  lessonId,
  sortOrder,
  duration,
});

describe('planAnnouncement', () => {
  it('gives a new lesson every part, in play order', () => {
    const items = planAnnouncement(
      {
        lessons: [lesson('sun', '2026-10-11')],
        claimedLessonIds: ['sun'],
        claimedPartIds: ['b', 'a'],
        parts: [part('b', 'sun', 1, 4223), part('a', 'sun', 0, 4925)],
      },
      tParts,
    );
    expect(items).toEqual([
      { kind: 'lesson', lesson: lesson('sun', '2026-10-11'), partIds: ['a', 'b'], partLabels: ['חלק 1: 82 דק׳', 'חלק 2: 70 דק׳'] },
    ]);
  });

  it('numbers parts added to an announced lesson by their real place in it', () => {
    const items = planAnnouncement(
      {
        lessons: [lesson('mon', '2026-10-12')],
        claimedLessonIds: [],
        claimedPartIds: ['p3'],
        parts: [part('p1', 'mon', 0, 4925), part('p3', 'mon', 2, 600), part('p2', 'mon', 1, 4223)],
      },
      tParts,
    );
    expect(items).toEqual([
      { kind: 'parts', lesson: lesson('mon', '2026-10-12'), partIds: ['p3'], partLabels: ['חלק 3: 10 דק׳'] },
    ]);
  });

  it('leaves out published lessons with nothing claimed, and orders oldest first, daily before shorts', () => {
    const items = planAnnouncement(
      {
        lessons: [
          lesson('tue-short', '2026-10-13', 'קצר', true),
          lesson('tue', '2026-10-13'),
          lesson('old', '2026-10-01'),
          lesson('sun', '2026-10-11'),
        ],
        claimedLessonIds: ['tue-short', 'tue', 'sun'],
        claimedPartIds: [],
        parts: [part('x', 'old', 0, 600)],
      },
      tParts,
    );
    expect(items.map((item) => item.lesson.id)).toEqual(['sun', 'tue', 'tue-short']);
  });

  it('has nothing to announce when nothing was claimed', () => {
    const items = planAnnouncement(
      {
        lessons: [lesson('sun', '2026-10-11')],
        claimedLessonIds: [],
        claimedPartIds: [],
        parts: [part('a', 'sun', 0, 600)],
      },
      tParts,
    );
    expect(items).toEqual([]);
    expect(renderAnnouncement(items, t)).toBeNull();
  });
});

describe('renderAnnouncement', () => {
  it('reads one new lesson like a single-lesson notification, with its parts', () => {
    const sun = lesson('sun', '2026-10-11', 'בראשית');
    const content = renderAnnouncement(
      [{ kind: 'lesson', lesson: sun, partIds: ['a', 'b'], partLabels: ['חלק 1: 82 דק׳', 'חלק 2: 70 דק׳'] }],
      t,
    )!;
    expect(content.push).toEqual({
      title: 'שיעור חדש עלה',
      body: 'בראשית\nחלק 1: 82 דק׳ · חלק 2: 70 דק׳',
      url: localePath(lessonPath(sun)),
      tag: 'lesson-sun',
    });
    expect(content.email.subject).toBe('שיעור חדש: בראשית');
    expect(content.email.items).toEqual([
      { title: 'בראשית', url: lessonUrl(sun), dateLabel: '11.10.2026', detail: 'חלק 1: 82 דק׳ · חלק 2: 70 דק׳' },
    ]);
    expect(content.email.cta.url).toBe(lessonUrl(sun));
  });

  it('announces parts added to an earlier lesson with their own title and tag', () => {
    const mon = lesson('mon', '2026-10-12', 'נח');
    const content = renderAnnouncement([{ kind: 'parts', lesson: mon, partIds: ['p3'], partLabels: ['חלק 3: 10 דק׳'] }], t)!;
    expect(content.push.title).toBe('נוסף חלק חדש');
    expect(content.push.body).toBe('נח\nחלק 3: 10 דק׳');
    expect(content.push.tag).toBe('lesson-parts-p3');
    expect(content.email.subject).toBe('חלק חדש: נח');
    expect(content.email.items[0].detail).toBe('נוספו: חלק 3: 10 דק׳');
  });

  it('sums up several lessons in one notification with the date range, opening the newest', () => {
    const sun = lesson('sun', '2026-10-11');
    const mon = lesson('mon', '2026-10-12');
    const tue = lesson('tue', '2026-10-13');
    const content = renderAnnouncement(
      [
        { kind: 'lesson', lesson: sun, partIds: ['a'], partLabels: ['82 דק׳'] },
        { kind: 'lesson', lesson: mon, partIds: ['b'], partLabels: [] },
        { kind: 'lesson', lesson: tue, partIds: ['c', 'd'], partLabels: ['חלק 1: 40 דק׳', 'חלק 2: 30 דק׳'] },
      ],
      t,
    )!;
    expect(content.push.title).toBe('3 שיעורים חדשים עלו');
    expect(content.push.body).toBe('11.10.2026 – 13.10.2026\nשיעור sun\nשיעור mon\nשיעור tue');
    expect(content.push.url).toBe(localePath(lessonPath(tue)));
    expect(content.email.items.map((item) => item.detail)).toEqual(['82 דק׳', null, 'חלק 1: 40 דק׳ · חלק 2: 30 דק׳']);
    expect(content.email.cta.url).toBe(pageUrl('/lessons'));
  });

  it('mentions parts added to an earlier lesson inside a summary of new lessons', () => {
    const content = renderAnnouncement(
      [
        { kind: 'parts', lesson: lesson('sun', '2026-10-11'), partIds: ['p2'], partLabels: ['חלק 2: 70 דק׳'] },
        { kind: 'lesson', lesson: lesson('mon', '2026-10-12'), partIds: ['a'], partLabels: [] },
      ],
      t,
    )!;
    expect(content.push.title).toBe('שיעור חדש עלה');
    expect(content.push.body).toBe('11.10.2026 – 12.10.2026\nשיעור sun\nשיעור mon');
  });

  it('lists up to three titles in the push body and counts the rest', () => {
    const newLessons = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
      lesson(id, `2026-10-${String(11 + index).padStart(2, '0')}`, `כותרת ${id}`),
    );
    const content = renderAnnouncement(
      newLessons.map((item) => ({ kind: 'lesson' as const, lesson: item, partIds: ['p'], partLabels: [] })),
      t,
    )!;
    expect(content.push.body).toBe('11.10.2026 – 15.10.2026\nכותרת a\nכותרת b\nכותרת c\nועוד 2');
    expect(content.email.intro).toEqual(['11.10.2026 – 15.10.2026']);
  });

  it('cuts titles longer than 60 characters and keeps a several-lesson body short', () => {
    const longTitle = 'א'.repeat(120);
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({
      kind: 'lesson' as const,
      lesson: lesson(id, `2026-10-${String(11 + index).padStart(2, '0')}`, longTitle),
      partIds: ['p'],
      partLabels: [],
    }));
    const body = renderAnnouncement(items, t)!.push.body;
    const [range, ...rest] = body.split('\n');
    expect(range).toBe('11.10.2026 – 16.10.2026');
    expect(rest).toEqual([`${'א'.repeat(59)}…`, `${'א'.repeat(59)}…`, `${'א'.repeat(59)}…`, 'ועוד 3']);
    expect(body.length).toBeLessThan(400);
  });
});
