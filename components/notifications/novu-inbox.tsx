'use client';

import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface NotificationsDict {
  inbox: string;
  markAllRead: string;
  noNotifications: string;
  loading: string;
  error: string;
}

interface NovuInboxProps {
  locale: string;
  dictionary: {
    notifications: NotificationsDict;
  };
  className?: string;
}

export function NovuInbox({ locale, dictionary, className }: NovuInboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNotifications] = useState(false); // This will be connected to Novu later

  // For development purposes, we'll render a basic notification bell
  // In production, this will be replaced with the actual Novu Inbox component
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`relative ${className}`}
          aria-label={dictionary.notifications.inbox}
        >
          <Bell className="h-5 w-5" />
          {hasNotifications && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full" />
          )}
          <span className="sr-only">{dictionary.notifications.inbox}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4">
          <h3 className="font-semibold text-sm mb-3">
            {dictionary.notifications.inbox}
          </h3>
          <div className="text-sm text-muted-foreground text-center py-8">
            {dictionary.notifications.noNotifications}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}