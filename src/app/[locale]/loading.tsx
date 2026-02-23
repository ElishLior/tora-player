import {
  PageHeaderSkeleton,
  LessonListSkeleton,
} from '@/components/shared/loading-skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <LessonListSkeleton count={6} />
    </div>
  );
}
