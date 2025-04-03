'use client';

import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function SecurityForm({
  email,
  lang,
}: {
  email?: string;
  lang: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const router = useRouter();
  const supabase = createClient();

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
        <Input type="email" value={email} disabled className="bg-muted" />
      </div>

      <form onSubmit={handlePasswordUpdate} className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </form>
    </div>
  );
}
