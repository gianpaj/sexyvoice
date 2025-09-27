'use client';

import React, { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface ApiKeysProps {
  dict: {
    profile: {
      apiKeys: {
        title: string;
        description: string;
        createNew: string;
        noKeys: string;
        createFirst: string;
        table: {
          name: string;
          description: string;
          key: string;
          created: string;
          lastUsed: string;
          status: string;
          actions: string;
        };
        status: {
          active: string;
          inactive: string;
        };
        actions: {
          copy: string;
          delete: string;
          show: string;
          hide: string;
        };
        dialog: {
          create: {
            title: string;
            description: string;
            nameLabel: string;
            namePlaceholder: string;
            descriptionLabel: string;
            descriptionPlaceholder: string;
            cancel: string;
            create: string;
            creating: string;
          };
          delete: {
            title: string;
            description: string;
            cancel: string;
            delete: string;
            deleting: string;
          };
          success: {
            title: string;
            description: string;
            keyPrefix: string;
            copyKey: string;
            warning: string;
            close: string;
          };
        };
        toast: {
          created: string;
          deleted: string;
          copied: string;
          copyError: string;
          createError: string;
          deleteError: string;
          loadError: string;
        };
      };
    };
  };
}

export function ApiKeys({ dict }: ApiKeysProps) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const { toast } = useToast();

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: dict.profile.apiKeys.toast.loadError,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!formData.name.trim()) return;

    try {
      setLoading(true);
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create API key');
      }

      setNewApiKey(result.key);
      setCreateDialogOpen(false);
      setSuccessDialogOpen(true);
      setFormData({ name: '', description: '' });
      await loadApiKeys();

      toast({
        title: dict.profile.apiKeys.toast.created,
        description: `API key "${formData.name}" created successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: dict.profile.apiKeys.toast.createError,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteApiKey = async (keyId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete API key');
      }

      await loadApiKeys();
      setDeleteDialogOpen(false);
      setSelectedKeyId(null);

      toast({
        title: dict.profile.apiKeys.toast.deleted,
        description: 'API key deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: dict.profile.apiKeys.toast.deleteError,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: dict.profile.apiKeys.toast.copied,
        description: 'API key copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: dict.profile.apiKeys.toast.copyError,
        variant: 'destructive',
      });
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Load API keys on component mount
  React.useEffect(() => {
    loadApiKeys();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{dict.profile.apiKeys.title}</CardTitle>
            <CardDescription>{dict.profile.apiKeys.description}</CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {dict.profile.apiKeys.createNew}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{dict.profile.apiKeys.dialog.create.title}</DialogTitle>
                <DialogDescription>
                  {dict.profile.apiKeys.dialog.create.description}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">{dict.profile.apiKeys.dialog.create.nameLabel}</Label>
                  <Input
                    id="name"
                    placeholder={dict.profile.apiKeys.dialog.create.namePlaceholder}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="description">
                    {dict.profile.apiKeys.dialog.create.descriptionLabel}
                  </Label>
                  <Textarea
                    id="description"
                    placeholder={dict.profile.apiKeys.dialog.create.descriptionPlaceholder}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={loading}
                >
                  {dict.profile.apiKeys.dialog.create.cancel}
                </Button>
                <Button onClick={createApiKey} disabled={loading || !formData.name.trim()}>
                  {loading
                    ? dict.profile.apiKeys.dialog.create.creating
                    : dict.profile.apiKeys.dialog.create.create}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{dict.profile.apiKeys.noKeys}</p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              {dict.profile.apiKeys.createFirst}
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.profile.apiKeys.table.name}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.description}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.key}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.created}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.lastUsed}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.status}</TableHead>
                <TableHead>{dict.profile.apiKeys.table.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {key.description || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {visibleKeys.has(key.id)
                          ? `${key.prefix}...sk-xxx-full-key-hidden`
                          : `${key.prefix}...`}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleKeyVisibility(key.id)}
                      >
                        {visibleKeys.has(key.id) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {visibleKeys.has(key.id)
                            ? dict.profile.apiKeys.actions.hide
                            : dict.profile.apiKeys.actions.show}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(`${key.prefix}...`)}
                      >
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">{dict.profile.apiKeys.actions.copy}</span>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(key.created_at)}</TableCell>
                  <TableCell>
                    {key.last_used_at ? formatDate(key.last_used_at) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.is_active ? 'default' : 'secondary'}>
                      {key.is_active
                        ? dict.profile.apiKeys.status.active
                        : dict.profile.apiKeys.status.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedKeyId(key.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{dict.profile.apiKeys.actions.delete}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dict.profile.apiKeys.dialog.delete.title}</DialogTitle>
              <DialogDescription>
                {dict.profile.apiKeys.dialog.delete.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={loading}
              >
                {dict.profile.apiKeys.dialog.delete.cancel}
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedKeyId && deleteApiKey(selectedKeyId)}
                disabled={loading}
              >
                {loading
                  ? dict.profile.apiKeys.dialog.delete.deleting
                  : dict.profile.apiKeys.dialog.delete.delete}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Success Dialog */}
        <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dict.profile.apiKeys.dialog.success.title}</DialogTitle>
              <DialogDescription>
                {dict.profile.apiKeys.dialog.success.description}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{dict.profile.apiKeys.dialog.success.keyPrefix}</Label>
                <div className="flex items-center space-x-2 mt-2">
                  <code className="bg-muted px-3 py-2 rounded text-sm flex-1">
                    {newApiKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => newApiKey && copyToClipboard(newApiKey)}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="sr-only">{dict.profile.apiKeys.actions.copy}</span>
                  </Button>
                </div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  {dict.profile.apiKeys.dialog.success.warning}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setSuccessDialogOpen(false);
                  setNewApiKey(null);
                }}
              >
                {dict.profile.apiKeys.dialog.success.close}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}