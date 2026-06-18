'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';

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

interface ApiKeyRow {
  created_at: string;
  expires_at: string | null;
  id: string;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
}

function DateTimeText({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Date(value).toLocaleString()}
    </time>
  );
}

interface CliLoginState {
  error: string | null;
  isCreatingNew: boolean;
  isLoading: boolean;
  newKeyName: string;
  selectedKeyId: string;
}

interface CliLoginAction {
  patch: Partial<CliLoginState>;
  type: 'patch';
}

function cliLoginReducer(
  state: CliLoginState,
  action: CliLoginAction,
): CliLoginState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

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
  const t = useTranslations('cliLogin');
  const [cliLoginState, dispatch] = useReducer(cliLoginReducer, {
    error: null,
    isCreatingNew: keys.length === 0,
    isLoading: false,
    newKeyName: 'CLI',
    selectedKeyId: keys[0]?.id ?? '',
  });
  const { error, isCreatingNew, isLoading, newKeyName, selectedKeyId } =
    cliLoginState;

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
    dispatch({
      type: 'patch',
      patch: {
        isLoading: true,
        error: null,
      },
    });

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
        dispatch({
          type: 'patch',
          patch: {
            error: json.error ?? t('errors.startFailed'),
            isLoading: false,
          },
        });
        return;
      }
      const redirectUrl = new URL(json.redirect_url);
      const isAllowedHost = ['127.0.0.1', 'localhost'].includes(
        redirectUrl.hostname,
      );
      const isAllowedProtocol =
        redirectUrl.protocol === 'http:' || redirectUrl.protocol === 'https:';
      if (!(isAllowedHost && isAllowedProtocol)) {
        dispatch({
          type: 'patch',
          patch: { error: 'Invalid redirect target', isLoading: false },
        });
        return;
      }
      window.location.assign(json.redirect_url);
    } catch (caughtError) {
      dispatch({
        type: 'patch',
        patch: {
          error:
            caughtError instanceof Error
              ? caughtError.message
              : t('errors.startFailed'),
          isLoading: false,
        },
      });
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {keys.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('existingKeys.label')}</Label>
              <p className="text-muted-foreground text-sm">
                {t('existingKeys.description')}
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
                      dispatch({
                        type: 'patch',
                        patch: {
                          selectedKeyId: key.id,
                          isCreatingNew: false,
                        },
                      });
                    }}
                    type="radio"
                  />
                  <div className="space-y-1">
                    <div className="font-medium">{key.name}</div>
                    <div className="text-muted-foreground text-sm">
                      {key.key_prefix}...
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {t('existingKeys.lastUsedLabel')}{' '}
                      {key.last_used_at ? (
                        <DateTimeText value={key.last_used_at} />
                      ) : (
                        t('existingKeys.never')
                      )}
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

                dispatch({
                  type: 'patch',
                  patch: {
                    isCreatingNew: next,
                    ...(!next && selectedKeyId.length === 0 && keys[0]?.id
                      ? { selectedKeyId: keys[0].id }
                      : {}),
                  },
                });
              }}
            />
            <div className="space-y-1">
              <Label htmlFor="create-new-cli-key">{t('createNew.label')}</Label>
              <p className="text-muted-foreground text-sm">
                {t('createNew.description')}
              </p>
            </div>
          </div>
          <Input
            disabled={!(isCreatingNew && hasCreateAccess)}
            onChange={(event) => {
              dispatch({
                type: 'patch',
                patch: { newKeyName: event.target.value },
              });
            }}
            placeholder={t('createNew.placeholder')}
            value={newKeyName}
          />
          {hasCreateAccess ? null : (
            <p className="text-muted-foreground text-sm">
              {t('createNew.paidOnly')}
            </p>
          )}
        </div>

        {error ? <p className="text-red-500 text-sm">{error}</p> : null}

        <div className="flex justify-end">
          <Button disabled={isLoading || !canContinue} onClick={handleContinue}>
            {isLoading ? t('actions.connecting') : t('actions.continue')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
