'use client';

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function SecurityForm({ email }: { email?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const supabase = getSupabaseBrowserClient();

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast.error('Failed to update password');
      setIsLoading(false);
      return;
    }

    toast.success('Password updated successfully');
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
          <AlertDescription>
            Enter your current password and a new password to update your
            credentials
          </AlertDescription>
        </Alert>
        <Label>Email Address</Label>
        <Input className="bg-muted" disabled type="email" value={email} />
      </div>

      <form className="grid grid-cols-1 gap-4" onSubmit={handlePasswordUpdate}>
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            type="password"
            value={currentPassword}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            onChange={(e) => setNewPassword(e.target.value)}
            required
            type="password"
            value={newPassword}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
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
            {isLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
