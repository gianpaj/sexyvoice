'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ApiKeyRow = {
  created_at: string;
  expires_at: string | null;
  id: string;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
};

export function CliLoginClient({
  callbackUrl,
  hasCreateAccess,
  keys,
  state,
}: {
  callbackUrl: string;
  hasCreateAccess: boolean;
  keys: ApiKeyRow[];
  state: string;
}) {
  const [selectedKeyId, setSelectedKeyId] = useState(keys[0]?.id ?? '');
  const [newKeyName, setNewKeyName] = useState('CLI');
  const [isCreatingNew, setIsCreatingNew] = useState(keys.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canContinue = isCreatingNew
    ? hasCreateAccess && newKeyName.trim().length > 0
    : selectedKeyId.length > 0;

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/cli-login-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key_id: isCreatingNew ? undefined : selectedKeyId,
          callback_url: callbackUrl,
          name: isCreatingNew ? newKeyName : undefined,
          state,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? 'Failed to start CLI login');
      }
      window.location.assign(json.redirect_url);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to start CLI login',
      );
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Connect CLI</CardTitle>
        <CardDescription>
          Pick an existing API key to rotate into your CLI, or create a fresh
          one if this account does not have one yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {keys.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Existing API keys</Label>
              <p className="text-muted-foreground text-sm">
                Selecting a key rotates it. Your CLI receives the replacement
                secret once, and the old secret is deactivated.
              </p>
            </div>
            <div className="space-y-2">
              {keys.map((key) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  htmlFor={key.id}
                  key={key.id}
                >
                  <input
                    checked={!isCreatingNew && selectedKeyId === key.id}
                    className="mt-1"
                    id={key.id}
                    name="api-key"
                    onChange={() => {
                      setSelectedKeyId(key.id);
                      setIsCreatingNew(false);
                    }}
                    type="radio"
                  />
                  <div className="space-y-1">
                    <div className="font-medium">{key.name}</div>
                    <div className="text-muted-foreground text-sm">
                      {key.key_prefix}...
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Last used:{' '}
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : 'Never'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="create-new-cli-key">Create new key instead</Label>
              <p className="text-muted-foreground text-sm">
                Use this if you do not want to rotate an existing key.
              </p>
            </div>
            <input
              checked={isCreatingNew}
              disabled={!hasCreateAccess}
              id="create-new-cli-key"
              onChange={() => setIsCreatingNew(true)}
              type="radio"
            />
          </div>
          <Input
            disabled={!isCreatingNew || !hasCreateAccess}
            onChange={(event) => setNewKeyName(event.target.value)}
            placeholder="CLI"
            value={newKeyName}
          />
          {!hasCreateAccess ? (
            <p className="text-muted-foreground text-sm">
              Creating new API keys still requires a paid account.
            </p>
          ) : null}
        </div>

        {error ? <p className="text-red-500 text-sm">{error}</p> : null}

        <div className="flex justify-end">
          <Button disabled={isLoading || !canContinue} onClick={handleContinue}>
            {isLoading ? 'Connecting...' : 'Continue in CLI'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
