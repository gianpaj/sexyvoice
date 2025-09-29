'use client';

import { AlertTriangle, Lightbulb, Upload } from 'lucide-react';
import { useState, useRef } from 'react';
import { Crisp } from 'crisp-sdk-web';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/i18n/i18n-config';

interface FeedbackButtonProps {
  lang: Locale;
  dict: {
    feedback: {
      button: string;
      whatWouldYouLikeToShare: string;
      issue: {
        title: string;
        description: string;
      };
      idea: {
        title: string;
        description: string;
      };
      modal: {
        title: string;
        placeholder: string;
        attachScreenshot: string;
        technicalIssue: string;
        support: string;
        docs: string;
        cancel: string;
        send: string;
      };
    };
  };
}

export default function FeedbackButton({ lang, dict }: FeedbackButtonProps) {
  const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIssueClick = () => {
    if (typeof window !== 'undefined') {
      Crisp.chat.open();
    }
  };

  const handleIdeaClick = () => {
    setIsIdeaModalOpen(true);
  };

  const handleScreenshotUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setScreenshot(file);
    }
  };

  const handleSendIdea = () => {
    // Here you could implement sending the idea via API
    // For now, we'll just close the modal
    console.log('Sending idea:', { ideaText, screenshot });
    setIsIdeaModalOpen(false);
    setIdeaText('');
    setScreenshot(null);
  };

  const openSupportChat = () => {
    if (typeof window !== 'undefined') {
      Crisp.chat.open();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="text-sm">
            {dict.feedback.button}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-80 p-4 bg-card border-border"
        >
          <div className="text-sm font-medium mb-4">
            {dict.feedback.whatWouldYouLikeToShare}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleIssueClick}
              className="flex flex-col items-center justify-center p-4 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />
              <div className="font-medium">{dict.feedback.issue.title}</div>
              <div className="text-xs text-muted-foreground text-center">
                {dict.feedback.issue.description}
              </div>
            </button>
            <button
              onClick={handleIdeaClick}
              className="flex flex-col items-center justify-center p-4 rounded-lg border border-green-500 bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900 transition-colors"
            >
              <Lightbulb className="h-8 w-8 text-yellow-500 mb-2" />
              <div className="font-medium">{dict.feedback.idea.title}</div>
              <div className="text-xs text-muted-foreground text-center">
                {dict.feedback.idea.description}
              </div>
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isIdeaModalOpen} onOpenChange={setIsIdeaModalOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{dict.feedback.modal.title}</AlertDialogTitle>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <Textarea
              placeholder={dict.feedback.modal.placeholder}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              className="min-h-[100px]"
            />
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <Upload className="h-4 w-4 mr-1" />
                {dict.feedback.modal.attachScreenshot}
              </Button>
              {screenshot && (
                <span className="text-xs text-muted-foreground">
                  {screenshot.name}
                </span>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleScreenshotUpload}
              accept="image/*"
              className="hidden"
            />
            
            <div className="text-xs text-muted-foreground">
              {dict.feedback.modal.technicalIssue}
              <br />
              <button
                onClick={openSupportChat}
                className="text-primary hover:underline"
              >
                {dict.feedback.modal.support}
              </button>
              {' '}or{' '}
              <a
                href="https://sexyvoice.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {dict.feedback.modal.docs}
              </a>
              .
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>{dict.feedback.modal.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendIdea}>
              {dict.feedback.modal.send}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}