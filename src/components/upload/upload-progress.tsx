'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

interface UploadProgressProps {
  progress: number; // 0-100
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export function UploadProgress({ progress, status, error }: UploadProgressProps) {
  if (status === 'idle') return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-orange-500" />}
        {status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}

        <span className="text-sm">
          {status === 'uploading' && `מעלה... ${progress}%`}
          {status === 'processing' && 'מעבד...'}
          {status === 'complete' && 'הועלה בהצלחה!'}
          {status === 'error' && (error || 'שגיאה בהעלאה')}
        </span>
      </div>

      {(status === 'uploading' || status === 'processing') && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${status === 'processing' ? 100 : progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
