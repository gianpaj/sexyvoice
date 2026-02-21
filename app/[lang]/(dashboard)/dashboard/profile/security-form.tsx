'use client';

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function SecurityForm({
  email,
  dict,
}: {
  email?: string;
  dict: (typeof langDict)['profile']['securityForm'];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const supabase = getSupabaseBrowserClient();

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(dict.errors.passwordsDoNotMatch);
      return;
    }

    if (!email) {
      toast.error(dict.errors.updateFailed);
      return;
    }

    setIsLoading(true);

    // Verify current password before allowing the update
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      toast.error(dict.errors.currentPasswordIncorrect);
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast.error(dict.errors.updateFailed);
      setIsLoading(false);
      return;
    }

    toast.success(dict.success);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <Alert className="p-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{dict.description}</AlertDescription>
        </Alert>
        <Label>{dict.emailLabel}</Label>
        <Input className="bg-muted" disabled type="email" value={email} />
      </div>

      <form className="grid grid-cols-1 gap-4" onSubmit={handlePasswordUpdate}>
        <div className="space-y-2">
          <Label htmlFor="currentPassword">{dict.currentPassword}</Label>
          <Input
            id="currentPassword"
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            type="password"
            value={currentPassword}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">{dict.newPassword}</Label>
          <Input
            id="newPassword"
            onChange={(e) => setNewPassword(e.target.value)}
            required
            type="password"
            value={newPassword}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{dict.confirmPassword}</Label>
          <Input
            id="confirmPassword"
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </div>

        <div className="flex justify-end">
          <Button disabled={isLoading} type="submit">
            {isLoading ? dict.updating : dict.updatePassword}
          </Button>
        </div>
      </form>
    </div>
  );
}
