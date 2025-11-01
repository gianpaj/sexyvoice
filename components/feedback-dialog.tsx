'use client';

import { Crisp } from 'crisp-sdk-web';
import { Bug, Lightbulb, Loader2, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Textarea } from './ui/textarea';

interface FeedbackDialogProps {
  dict: (typeof langDict)['feedback'];
}

type FeedbackCategory = 'issue' | 'idea' | null;

export function FeedbackDialog({ dict }: FeedbackDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenCrisp = () => {
    if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      Crisp.chat.open();
      setIsOpen(false);
    }
  };

  const handleCategorySelect = (selectedCategory: 'issue' | 'idea') => {
    if (selectedCategory === 'issue') {
      handleOpenCrisp();
    } else {
      setCategory(selectedCategory);
    }
  };

  const handleSubmit = async () => {
    if (!feedbackText.trim()) {
      toast.error(dict.errors.emptyText);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: feedbackText,
          category,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      toast.success(dict.success);
      setFeedbackText('');
      setCategory(null);
      setIsOpen(false);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error(dict.errors.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setCategory(null);
    setFeedbackText('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setIsOpen(true)}
        >
          <MessageSquare className="size-4" />
          <span className="hidden sm:inline">{dict.title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.title}</DialogTitle>
          <DialogDescription>{dict.description}</DialogDescription>
        </DialogHeader>

        {!category ? (
          <div className="grid gap-4 py-4">
            <Button
              onClick={() => handleCategorySelect('issue')}
              className="flex items-center gap-3 h-auto py-4 bg-red-600 hover:bg-red-700"
            >
              <Bug className="size-5" />
              <div className="text-left">
                <div className="font-semibold">{dict.issueButton.title}</div>
                <div className="text-sm opacity-90">
                  {dict.issueButton.description}
                </div>
              </div>
            </Button>

            <Button
              onClick={() => handleCategorySelect('idea')}
              className="flex items-center gap-3 h-auto py-4 bg-blue-600 hover:bg-blue-700"
            >
              <Lightbulb className="size-5" />
              <div className="text-left">
                <div className="font-semibold">{dict.ideaButton.title}</div>
                <div className="text-sm opacity-90">
                  {dict.ideaButton.description}
                </div>
              </div>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Textarea
                placeholder={dict.textareaPlaceholder}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="min-h-32 resize-none"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !feedbackText.trim()}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {dict.submitting}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 size-4" />
                    {dict.sendButton}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCategory(null)}
                disabled={isSubmitting}
              >
                {dict.backButton}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground text-center">
              <span
                dangerouslySetInnerHTML={{
                  __html: dict.technicalIssueText.replace(
                    '{supportLink}',
                    `<button type="button" class="text-primary hover:underline font-medium">${dict.supportLinkText}</button>`,
                  ),
                }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName === 'BUTTON') {
                    handleOpenCrisp();
                  }
                }}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
