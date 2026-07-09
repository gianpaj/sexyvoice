'use client';

import {
  AudioLines,
  Copy,
  ExternalLink,
  KeyRound,
  Plus,
  Terminal,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FeatureCard } from '@/components/ui/feature-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ApiKeyRow {
  created_at: string;
  expires_at: string | null;
  id: string;
  is_active: boolean;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
}

function DateCell({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Date(value).toLocaleDateString()}
    </time>
  );
}

export function ApiKeys({ isPaidUser }: { isPaidUser: boolean }) {
  const t = useTranslations('profile.apiKeys');
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newApiKeyValue, setNewApiKeyValue] = useState<string | null>(null);
  const [name, setName] = useState('');

  const loadApiKeys = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/api-keys', { method: 'GET' });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? t('failedToLoad'));
      }
      setApiKeys(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadApiKeys().catch(() => undefined);
  }, [loadApiKeys]);

  const createKey = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? t('failedToCreate'));
      }
      setNewApiKeyValue(json.key);
      setDialogOpen(false);
      setName('');
      await loadApiKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToCreate'));
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error ?? t('failedToRevoke'));
      }
      await loadApiKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToRevoke'));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('copiedToClipboard'));
    } catch {
      toast.error(t('failedToCopy'));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!isPaidUser}>
                <Plus className="mr-2 h-4 w-4" />
                {t('newKey')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('createDialogTitle')}</DialogTitle>
                <DialogDescription>
                  {t('createDialogDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="api-key-name">{t('nameLabel')}</Label>
                <Input
                  id="api-key-name"
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('namePlaceholder')}
                  value={name}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={loading || !name.trim()}
                  onClick={createKey}
                  type="button"
                >
                  {t('createButton')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          {newApiKeyValue ? (
            <div className="rounded-md border p-4">
              <p className="mb-2 font-medium text-sm">{t('newKeyBanner')}</p>
              <div className="flex gap-2">
                <code className="block flex-1 overflow-auto rounded bg-muted px-3 py-2 text-xs">
                  {newApiKeyValue}
                </code>
                <Button
                  onClick={() => copy(newApiKeyValue)}
                  size="sm"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setNewApiKeyValue(null)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t('dismiss')}
                </Button>
              </div>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow className="[&>th]:px-4 [&>th]:text-muted-foreground">
                <TableHead>{t('table.name')}</TableHead>
                <TableHead>{t('table.prefix')}</TableHead>
                <TableHead>{t('table.created')}</TableHead>
                <TableHead>{t('table.lastUsed')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead className="text-right">
                  {t('table.action')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    {isPaidUser ? t('empty') : t('unpaidEmpty')}
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys.map((key) => (
                  <TableRow className="[&>td]:p-4" key={key.id}>
                    <TableCell>{key.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        <code>{key.key_prefix}...</code>
                      </span>
                    </TableCell>
                    <TableCell>
                      <DateCell value={key.created_at} />
                    </TableCell>
                    <TableCell>
                      {key.last_used_at ? (
                        <DateCell value={key.last_used_at} />
                      ) : (
                        t('never')
                      )}
                    </TableCell>
                    <TableCell>
                      {key.is_active ? t('statusActive') : t('statusRevoked')}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            disabled={loading || !key.is_active}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t('revokeConfirm.title')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('revokeConfirm.description')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t('revokeConfirm.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => revokeKey(key.id)}
                            >
                              {t('revokeConfirm.confirm')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="mt-4 text-sm">
          <h2 className="mb-1 font-semibold text-base text-white leading-8">
            {t('infoCard.title')}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureCard
              external
              href="https://docs.sexyvoice.ai/api-reference/endpoint/speech"
              icon={AudioLines}
              title={t('infoCard.generateTitle')}
            >
              <span className="text-sm">
                {t('infoCard.generateDescription')}
              </span>
            </FeatureCard>
            <FeatureCard
              external
              href="https://github.com/gianpaj/sexyvoice-cli"
              icon={Terminal}
              title={t('infoCard.cliTitle')}
            >
              <span className="text-sm">{t('infoCard.cliDescription')}</span>
            </FeatureCard>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-muted-foreground">
            {t('infoCard.moreInfo')}
            <Link
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href="https://docs.sexyvoice.ai"
              target="_blank"
            >
              {t('infoCard.docsLinkLabel')}
              <ExternalLink className="size-3" />
            </Link>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
