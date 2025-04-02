'use client';

import { formatDistanceToNow } from 'date-fns';
import { Globe2, Lock, MoreVertical, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';

export function VoicesList({
  voices,
  lang,
}: {
  voices: Voice[];
  lang: string;
}) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handlePrivacyToggle = async (voiceId: string, isPublic: boolean) => {
    setIsLoading(voiceId);

    const { error } = await supabase
      .from('voices')
      .update({ is_public: isPublic })
      .eq('id', voiceId);

    if (!error) {
      router.refresh();
    }

    setIsLoading(null);
  };

  const handleDelete = async (voiceId: string) => {
    setIsLoading(voiceId);

    const { error } = await supabase.from('voices').delete().eq('id', voiceId);

    if (!error) {
      router.refresh();
    }

    setIsLoading(null);
  };

  if (voices.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">No voices yet</h3>
        <p className="text-muted-foreground mb-4">
          Create your first voice clone to get started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {voices.map((voice) => (
        <Card key={voice.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-semibold">
              {voice.name}
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => handleDelete(voice.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete voice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <CardDescription className="flex items-center text-sm">
              {voice.is_public ? (
                <Globe2 className="mr-1 h-4 w-4" />
              ) : (
                <Lock className="mr-1 h-4 w-4" />
              )}
              {voice.language}
            </CardDescription>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Public access</span>
                <Switch
                  checked={voice.is_public|| undefined}
                  onCheckedChange={(checked) =>
                    handlePrivacyToggle(voice.id, checked)
                  }
                  disabled={isLoading === voice.id}
                />
              </div>

              {voice.created_at && <div className="text-sm text-muted-foreground">
                Created{' '}
                {formatDistanceToNow(new Date(voice.created_at), {
                  addSuffix: true,
                })}
              </div>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
