'use client';

import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

export default function NewVoicePage(props: {
  params: Promise<{ lang: string }>;
}) {
  const params = use(props.params);

  const { lang } = params;

  const [name, setName] = useState('');
  const [language, setLanguage] = useState('');
  // const [isPublic, setIsPublic] = useState(false);
  // const [isNsfw, setIsNsfw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      router.push(`/${lang}/login`);
      return;
    }

    const { error } = await supabase.from('voices').insert([
      {
        name,
        language,
        is_public: false,
        is_nsfw: false,
        user_id: user.id,
      },
    ]);

    if (!error) {
      router.push(`/${lang}/dashboard/voices`);
      router.refresh();
    }

    setIsLoading(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Voice</CardTitle>
          <CardDescription>
            Set up a new voice clone with your preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Voice name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={setLanguage} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              {/* <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Public access</Label>
                  <p className="text-sm text-muted-foreground">
                    Make this voice available to other users
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div> */}

              {/* <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>NSFW content</Label>
                  <p className="text-sm text-muted-foreground">
                    Mark this voice as containing adult content
                  </p>
                </div>
                <Switch checked={isNsfw} onCheckedChange={setIsNsfw} />
              </div> */}
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Voice'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
