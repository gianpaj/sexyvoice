'use client';

import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
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
import type langDict from '@/lib/i18n/dictionaries/en.json';

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export function ApiKeys({
  dict,
  isPaidUser,
}: {
  dict: (typeof langDict)['profile']['apiKeys'];
  isPaidUser: boolean;
}) {
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
        throw new Error(json.error ?? dict.failedToLoad);
      }
      setApiKeys(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dict.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [dict.failedToLoad]);

  useEffect(() => {
    loadApiKeys();
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
        throw new Error(json.error ?? dict.failedToCreate);
      }
      setNewApiKeyValue(json.key);
      setDialogOpen(false);
      setName('');
      await loadApiKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dict.failedToCreate);
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
        throw new Error(json.error ?? dict.failedToRevoke);
      }
      await loadApiKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dict.failedToRevoke);
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(dict.copiedToClipboard);
    } catch {
      toast.error(dict.failedToCopy);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{dict.title}</CardTitle>
          <CardDescription>{dict.description}</CardDescription>
        </div>
        <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={!isPaidUser}>
              <Plus className="mr-2 h-4 w-4" />
              {dict.newKey}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dict.createDialogTitle}</DialogTitle>
              <DialogDescription>
                {dict.createDialogDescription}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="api-key-name">{dict.nameLabel}</Label>
              <Input
                id="api-key-name"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder={dict.namePlaceholder}
                value={name}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={loading || !name.trim()}
                onClick={createKey}
                type="button"
              >
                {dict.createButton}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {newApiKeyValue ? (
          <div className="rounded-md border p-4">
            <p className="mb-2 font-medium text-sm">{dict.newKeyBanner}</p>
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
                {dict.dismiss}
              </Button>
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.table.name}</TableHead>
              <TableHead>{dict.table.prefix}</TableHead>
              <TableHead>{dict.table.created}</TableHead>
              <TableHead>{dict.table.lastUsed}</TableHead>
              <TableHead>{dict.table.status}</TableHead>
              <TableHead className="text-right">{dict.table.action}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={6}>
                  {isPaidUser ? dict.empty : dict.unpaidEmpty}
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <code>{key.key_prefix}...</code>
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(key.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {key.last_used_at
                      ? new Date(key.last_used_at).toLocaleDateString()
                      : dict.never}
                  </TableCell>
                  <TableCell>
                    {key.is_active ? dict.statusActive : dict.statusRevoked}
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
                            {dict.revokeConfirm.title}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {dict.revokeConfirm.description}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {dict.revokeConfirm.cancel}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => revokeKey(key.id)}
                          >
                            {dict.revokeConfirm.confirm}
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
  );
}
