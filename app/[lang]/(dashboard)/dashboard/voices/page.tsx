import { createClient } from '@/lib/supabase/server'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { Locale } from '@/lib/i18n/i18n-config'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { VoicesList } from './voices-list'
import Link from 'next/link'

export default async function VoicesPage({
  params: { lang }
}: {
  params: { lang: Locale }
}) {
  const supabase = createClient()
  const dict = await getDictionary(lang)

  const { data } = await supabase.auth.getUser()
  const user = data?.user

  const { data: voices } = await supabase
    .from('voices')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Voices</h2>
          <p className="text-muted-foreground">
            Manage your voice clones and create new ones
          </p>
        </div>
        <Link href={`/${lang}/dashboard/voices/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Voice
          </Button>
        </Link>
      </div>

      <VoicesList voices={voices || []} lang={lang} />
    </div>
  )
}
