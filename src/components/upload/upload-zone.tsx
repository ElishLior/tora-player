'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, FileAudio, X, GripVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { isAudioFile, extractAudioMetadata, formatFileSize, type AudioMetadata } from '@/lib/audio-utils';

export interface SelectedFile {
  file: File;
  metadata: AudioMetadata;
}

interface UploadZoneProps {
  onFilesSelected: (files: SelectedFile[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  // Legacy single-file callback
  onFileSelected?: (file: File, metadata: AudioMetadata) => void;
}

export function UploadZone({ onFilesSelected, onFileSelected, disabled, multiple = true }: UploadZoneProps) {
  const t = useTranslations('lessons');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: File[]) => {
    setError(null);
    setIsProcessing(true);

    const validFiles: SelectedFile[] = [];

    for (const file of fileList) {
      if (!isAudioFile(file)) {
        setError('קובץ לא נתמך. העלה MP3, WAV, OGG, M4A, FLAC או WebM.');
        continue;
      }

      if (file.size > 500 * 1024 * 1024) {
        setError('קובץ גדול מדי. מקסימום 500MB.');
        continue;
      }

      try {
        const metadata = await extractAudioMetadata(file);
        validFiles.push({ file, metadata });
      } catch {
        validFiles.push({
          file,
          metadata: {
            duration: 0,
            format: file.type || 'audio/mpeg',
            fileSize: file.size,
          },
        });
      }
    }

    if (validFiles.length > 0) {
      const newFiles = multiple
        ? [...selectedFiles, ...validFiles]
        : validFiles.slice(0, 1);

      setSelectedFiles(newFiles);
      onFilesSelected(newFiles);

      if (onFileSelected && newFiles.length > 0) {
        onFileSelected(newFiles[0].file, newFiles[0].metadata);
      }
    }

    setIsProcessing(false);
  }, [multiple, selectedFiles, onFilesSelected, onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    if (inputRef.current) inputRef.current.value = '';
  }, [processFiles]);

  const removeFile = useCallback((index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
    setError(null);
  }, [selectedFiles, onFilesSelected]);

  const moveFile = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= selectedFiles.length) return;
    const newFiles = [...selectedFiles];
    const [moved] = newFiles.splice(fromIndex, 1);
    newFiles.splice(toIndex, 0, moved);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  }, [selectedFiles, onFilesSelected]);

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.file.size, 0);

  return (
    <div className="space-y-3">
      {/* Drop zone — dark Spotify style */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8
          transition-all cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-[hsl(0,0%,25%)] hover:border-primary/50 hover:bg-[hsl(var(--surface-elevated))]'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
          multiple={multiple}
        />

        <div className="rounded-full bg-[hsl(var(--surface-elevated))] p-3 mb-3">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground font-medium text-center">
          {isProcessing ? t('loading') : (selectedFiles.length > 0 ? 'לחץ להוסיף עוד קבצים' : t('dragOrClick'))}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          MP3, WAV, OGG, M4A, FLAC, WebM (עד 500MB לקובץ)
        </p>
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {selectedFiles.length} {selectedFiles.length === 1 ? 'קובץ' : 'קבצים'} ({formatFileSize(totalSize)})
          </p>

          <div className="space-y-1">
            {selectedFiles.map((sf, index) => (
              <div
                key={`${sf.file.name}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-elevated))] p-2.5"
              >
                {multiple && selectedFiles.length > 1 && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveFile(index, index - 1); }}
                      disabled={index === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                      title="הזז למעלה"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <FileAudio className="h-5 w-5 text-primary flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sf.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(sf.file.size)}
                    {sf.metadata.duration > 0 && ` · ${Math.floor(sf.metadata.duration / 60)}:${String(Math.round(sf.metadata.duration % 60)).padStart(2, '0')}`}
                  </p>
                </div>

                {multiple && selectedFiles.length > 1 && (
                  <span className="text-[10px] text-muted-foreground bg-[hsl(var(--surface-highlight))] px-1.5 py-0.5 rounded-full">
                    {index + 1}
                  </span>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  className="rounded-full p-1 hover:bg-[hsl(var(--surface-highlight))] flex-shrink-0 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
