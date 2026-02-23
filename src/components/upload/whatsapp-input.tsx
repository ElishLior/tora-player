'use client';

import { useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseWhatsAppText, type ParsedWhatsAppMessage } from '@/lib/whatsapp-parser';

interface WhatsAppInputProps {
  onParsed: (result: ParsedWhatsAppMessage) => void;
}

export function WhatsAppInput({ onParsed }: WhatsAppInputProps) {
  const t = useTranslations('lessons');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParsedWhatsAppMessage | null>(null);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    if (value.trim().length > 5) {
      const parsed = parseWhatsAppText(value);
      setPreview(parsed);
      onParsed(parsed);
    } else {
      setPreview(null);
    }
  }, [onParsed]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <MessageSquare className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={t('pasteWhatsApp')}
          className="w-full min-h-[120px] rounded-xl border bg-background px-10 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
          dir="rtl"
        />
      </div>

      {preview && (
        <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
          <p className="text-muted-foreground">{t('autoNamePreview')}</p>
          <p className="font-medium text-foreground" dir="rtl">{preview.hebrewTitle}</p>
          {preview.partNumber && (
            <p className="text-muted-foreground">{t('part')} {preview.partNumber}</p>
          )}
          {preview.seriesHint && (
            <p className="text-muted-foreground">{preview.seriesHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
