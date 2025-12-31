'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Globe2,
  Lock,
  // MessageCircleWarning,
  // MoreVertical,
  // Trash2,
} from 'lucide-react';
import Link from 'next/link';

// import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/i18n-config';
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from '@/components/ui/dropdown-menu';
// import { createClient } from '@/lib/supabase/client';

export function VoicesList({
  voices,
  lang,
}: {
  voices: Voice[];
  lang: Locale;
}) {
  // const [isLoading, setIsLoading] = useState<string | null>(null);
  // const router = useRouter();
  // const supabase = createClient();

  // const handleDelete = async (voiceId: string) => {
  //   setIsLoading(voiceId);

  //   const { error } = await supabase.from('voices').delete().eq('id', voiceId);

  //   if (!error) {
  //     router.refresh();
  //   }

  //   setIsLoading(null);
  // };

  // const handleReport = async (voiceId: string) => {
  //   setIsLoading(voiceId);

  //   // TODO

  //   // if (!error) {
  //   //   router.refresh();
  //   // }

  //   setIsLoading(null);
  // };

  if (voices.length === 0) {
    return (
      <div className="py-12 text-center">
        <h3 className="mb-2 font-semibold text-lg">No voices yet</h3>
        <p className="mb-4 text-muted-foreground">
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
            <CardTitle className="font-semibold text-lg">
              {voice.name}
            </CardTitle>
            {/* {!voice.is_public && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* TODO if is mine * /}
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => handleDelete(voice.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete voice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleReport(voice.id)}>
                    <MessageCircleWarning className="mr-2 h-4 w-4" />
                    Report voice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )} */}
          </CardHeader>
          <CardContent>
            <Link href={`/${lang}/dashboard/voices/new?voice_id=${voice.id}`}>
              <CardDescription className="flex items-center text-sm">
                {voice.is_public ? (
                  <Globe2 className="mr-1 h-4 w-4" />
                ) : (
                  <Lock className="mr-1 h-4 w-4" />
                )}
                {voice.language}
              </CardDescription>

              <div className="mt-4 space-y-4">
                {voice.created_at && (
                  <div className="text-muted-foreground text-sm">
                    Created{' '}
                    {formatDistanceToNow(new Date(voice.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                )}
              </div>
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
