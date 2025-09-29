'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Plus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface ApiKey {
  id: string;
  description: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface ApiKeysDict {
  title?: string;
  description?: string;
  createKey?: string;
  keyDescription?: string;
  keyDescriptionPlaceholder?: string;
  create?: string;
  cancel?: string;
  noKeys?: string;
  noKeysDescription?: string;
  createdAt?: string;
  lastUsed?: string;
  never?: string;
  copyKey?: string;
  deleteKey?: string;
  keyCreated?: string;
  keyCreatedDescription?: string;
  keyDeleted?: string;
  error?: string;
  deleteConfirm?: string;
  deleteConfirmDescription?: string;
  delete?: string;
  documentation?: string;
  viewDocs?: string;
}

export function ApiKeysClient({ dict }: { dict?: ApiKeysDict }) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/api-keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      toast.error(dict?.error || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    try {
      setIsCreating(true);
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewApiKey(data.key);
        setDescription('');
        fetchApiKeys();
        toast.success(dict?.keyCreated || 'API key created successfully');
      } else {
        toast.error(dict?.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast.error(dict?.error || 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const response = await fetch('/api/api-keys', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        fetchApiKeys();
        toast.success(dict?.keyDeleted || 'API key deleted successfully');
      } else {
        toast.error(dict?.error || 'Failed to delete API key');
      }
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error(dict?.error || 'Failed to delete API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* New API Key Modal */}
      {newApiKey && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">
              {dict?.keyCreated || 'API Key Created'}
            </CardTitle>
            <CardDescription className="text-green-600">
              {dict?.keyCreatedDescription || 'Please copy and save your API key now. You won\'t be able to see it again.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Input
                value={newApiKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                onClick={() => copyToClipboard(newApiKey)}
                size="sm"
                variant="outline"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={() => setNewApiKey(null)}
              variant="ghost"
              size="sm"
              className="mt-2"
            >
              {dict?.cancel || 'Close'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Documentation Link */}
      <Card>
        <CardHeader>
          <CardTitle>
            {dict?.documentation || 'API Documentation'}
          </CardTitle>
          <CardDescription>
            View the complete API reference and integration examples.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Button asChild variant="outline">
              <a href="/api/openapi" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                OpenAPI Specification
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://docs.sexyvoice.ai/api" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                {dict?.viewDocs || 'View Documentation'}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create API Key */}
      <Card>
        <CardHeader>
          <CardTitle>
            {dict?.createKey || 'Create New API Key'}
          </CardTitle>
          <CardDescription>
            Generate a new API key for external access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="description">
              {dict?.keyDescription || 'Description'}
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={dict?.keyDescriptionPlaceholder || 'e.g., My mobile app'}
            />
          </div>
          <Button 
            onClick={createApiKey} 
            disabled={isCreating || !description.trim()}
          >
            <Plus className="h-4 w-4 mr-2" />
            {isCreating ? 'Creating...' : (dict?.create || 'Create API Key')}
          </Button>
        </CardContent>
      </Card>

      {/* API Keys List */}
      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            Manage your existing API keys and monitor their usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {dict?.noKeys || 'No API keys found'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {dict?.noKeysDescription || 'Create your first API key to get started with external access.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">
                        {key.description || 'Untitled'}
                      </span>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="mr-4">
                        {dict?.createdAt || 'Created'}: {new Date(key.created_at).toLocaleDateString()}
                      </span>
                      <span>
                        {dict?.lastUsed || 'Last used'}: {
                          key.last_used_at 
                            ? new Date(key.last_used_at).toLocaleDateString()
                            : (dict?.never || 'Never')
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => setDeleteKeyId(key.id)}
                      variant="ghost"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dict?.deleteConfirm || 'Delete API Key'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dict?.deleteConfirmDescription || 'This action cannot be undone. This API key will be permanently disabled and any applications using it will stop working.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {dict?.cancel || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteKeyId) {
                  deleteApiKey(deleteKeyId);
                  setDeleteKeyId(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {dict?.delete || 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}