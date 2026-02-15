'use client';

import { Plus, X } from 'lucide-react';
import { useState, useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/i18n/i18n-config';

interface FeedbackButtonProps {
  lang: Locale;
  dict: {
    feedback: {
      button: string;
      modal: {
        title: string;
        question: string;
        placeholder: string;
        uploadHint: string;
        cancel: string;
        submit: string;
        successMessage: string;
        errorMessage: string;
      };
    };
  };
}

export default function FeedbackButton({ lang, dict }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScreenshotUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const removeScreenshot = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setMessage('');
    removeScreenshot();
    setSubmitStatus('idle');
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          type: 'feedback',
          language: lang,
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="text-sm"
        onClick={() => setIsOpen(true)}
      >
        {dict.feedback.button}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dict.feedback.modal.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {dict.feedback.modal.question}
            </p>

            <Textarea
              placeholder={dict.feedback.modal.placeholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[120px] resize-none"
            />

            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {dict.feedback.modal.uploadHint}
              </p>

              <div className="flex items-start gap-2">
                {previewUrl ? (
                  <div className="relative w-20 h-20 rounded-md border border-border overflow-hidden">
                    <img
                      src={previewUrl}
                      alt="Screenshot preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeScreenshot}
                      className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center w-20 h-20 rounded-md border border-dashed border-border hover:border-foreground/50 transition-colors"
                  >
                    <Plus className="h-6 w-6 text-muted-foreground" />
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleScreenshotUpload}
                accept="image/*"
                className="hidden"
              />
            </div>

            {submitStatus === 'success' && (
              <p className="text-sm text-green-600">
                {dict.feedback.modal.successMessage}
              </p>
            )}
            {submitStatus === 'error' && (
              <p className="text-sm text-red-600">
                {dict.feedback.modal.errorMessage}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose}>
              {dict.feedback.modal.cancel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!message.trim() || isSubmitting}
            >
              {dict.feedback.modal.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
