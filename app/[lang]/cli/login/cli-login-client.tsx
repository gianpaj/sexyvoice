'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type langDict from '@/messages/en.json';

interface ApiKeyRow {
  created_at: string;
  expires_at: string | null;
  id: string;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
}

export function CliLoginClient({
  callbackUrl,
  dict,
  hasCreateAccess,
  keys,
  state,
}: {
  callbackUrl: string;
  dict: (typeof langDict)['cliLogin'];
  hasCreateAccess: boolean;
  keys: ApiKeyRow[];
  state: string;
}) {
  const [selectedKeyId, setSelectedKeyId] = useState(keys[0]?.id ?? '');
  const [newKeyName, setNewKeyName] = useState('CLI');
  const [isCreatingNew, setIsCreatingNew] = useState(keys.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

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
        throw new Error(json.error ?? dict.errors.startFailed);
      }
      const redirectUrl = new URL(json.redirect_url);
      if (!['127.0.0.1', 'localhost'].includes(redirectUrl.hostname)) {
        throw new Error('Invalid redirect target');
      }
      window.location.assign(json.redirect_url);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : dict.errors.startFailed,
      );
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{dict.title}</CardTitle>
        <CardDescription>{dict.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {keys.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{dict.existingKeys.label}</Label>
              <p className="text-muted-foreground text-sm">
                {dict.existingKeys.description}
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
                      {dict.existingKeys.lastUsedLabel}{' '}
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleString()
                        : dict.existingKeys.never}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isCreatingNew}
              className="mt-1"
              disabled={!hasCreateAccess}
              id="create-new-cli-key"
              onCheckedChange={(checked) => {
                const next = checked === true;

                if (!next && keys.length === 0) {
                  return;
                }

                setIsCreatingNew(next);

                if (!next && selectedKeyId.length === 0 && keys[0]?.id) {
                  setSelectedKeyId(keys[0].id);
                }
              }}
            />
            <div className="space-y-1">
              <Label htmlFor="create-new-cli-key">{dict.createNew.label}</Label>
              <p className="text-muted-foreground text-sm">
                {dict.createNew.description}
              </p>
            </div>
          </div>
          <Input
            disabled={!(isCreatingNew && hasCreateAccess)}
            onChange={(event) => setNewKeyName(event.target.value)}
            placeholder={dict.createNew.placeholder}
            value={newKeyName}
          />
          {hasCreateAccess ? null : (
            <p className="text-muted-foreground text-sm">
              {dict.createNew.paidOnly}
            </p>
          )}
        </div>

        {error ? <p className="text-red-500 text-sm">{error}</p> : null}

        <div className="flex justify-end">
          <Button disabled={isLoading || !canContinue} onClick={handleContinue}>
            {isLoading ? dict.actions.connecting : dict.actions.continue}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
