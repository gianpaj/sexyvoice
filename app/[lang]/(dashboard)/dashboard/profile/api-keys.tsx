'use client';

import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export function ApiKeys() {
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
        throw new Error(json.error ?? 'Failed to load API keys');
      }
      setApiKeys(json.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load API keys',
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
        throw new Error(json.error ?? 'Failed to create API key');
      }
      setNewApiKeyValue(json.key);
      setDialogOpen(false);
      setName('');
      await loadApiKeys();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create API key',
      );
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
        throw new Error(json.error ?? 'Failed to revoke API key');
      }
      await loadApiKeys();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to revoke API key',
      );
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Create and manage keys for the external API.
          </CardDescription>
        </div>
        <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
              <DialogDescription>
                The key is shown only once. Save it securely.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Description</Label>
              <Input
                id="api-key-name"
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Production backend"
                value={name}
              />
            </div>
            <DialogFooter>
              <Button
                disabled={loading || !name.trim()}
                onClick={createKey}
                type="button"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        {newApiKeyValue ? (
          <div className="rounded-md border p-4">
            <p className="mb-2 font-medium text-sm">New API key (shown once)</p>
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
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={6}>
                  No API keys created yet.
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
                      : 'Never'}
                  </TableCell>
                  <TableCell>{key.is_active ? 'Active' : 'Revoked'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      disabled={loading || !key.is_active}
                      onClick={() => revokeKey(key.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
