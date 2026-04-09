'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { updateProfilePreferencesAction } from '@/app/[lang]/(dashboard)/dashboard/profile/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Locale } from '@/lib/i18n/i18n-config';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import type langDict from '@/messages/en.json';

type PreferencesDict = (typeof langDict)['profile']['preferences'];

export function PreferencesForm({
  currentLocale,
  dict,
  initialFirstGenerationEmail,
  initialWelcomeEmail,
}: {
  currentLocale: Locale;
  dict: PreferencesDict;
  initialFirstGenerationEmail: boolean;
  initialWelcomeEmail: boolean;
}) {
  const [selectedLocale, setSelectedLocale] = useState(currentLocale);
  const [welcomeEmail, setWelcomeEmail] = useState(initialWelcomeEmail);
  const [firstGenerationEmail, setFirstGenerationEmail] = useState(
    initialFirstGenerationEmail,
  );
  const [isPending, setIsPending] = useState(false);
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('profile.preferences');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);

    try {
      const result = await updateProfilePreferencesAction({
        locale: selectedLocale,
        welcomeEmail,
        firstGenerationEmail,
      });

      toast.success(dict.saveSuccess);

      if (result.locale !== locale) {
        router.replace(pathname, { locale: result.locale });
        return;
      }

      router.refresh();
    } catch (_error) {
      toast.error(dict.saveError);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="profile-locale">{dict.localeLabel}</Label>
          <p className="text-muted-foreground text-sm">
            {dict.localeDescription}
          </p>
        </div>
        <Select
          onValueChange={(value) => setSelectedLocale(value as Locale)}
          value={selectedLocale}
        >
          <SelectTrigger id="profile-locale">
            <SelectValue placeholder={dict.localePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{dict.localeOptions.en}</SelectItem>
            <SelectItem value="es">{dict.localeOptions.es}</SelectItem>
            <SelectItem value="de">{dict.localeOptions.de}</SelectItem>
            <SelectItem value="da">{dict.localeOptions.da}</SelectItem>
            <SelectItem value="it">{dict.localeOptions.it}</SelectItem>
            <SelectItem value="fr">{dict.localeOptions.fr}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="font-medium text-base">{dict.optionalEmailsTitle}</h3>
          <p className="text-muted-foreground text-sm">
            {dict.optionalEmailsDescription}
          </p>
        </div>

        <PreferenceCheckbox
          checked={welcomeEmail}
          description={t('items.welcomeEmail.description')}
          label={t('items.welcomeEmail.label')}
          onCheckedChange={setWelcomeEmail}
        />

        <PreferenceCheckbox
          checked={firstGenerationEmail}
          description={t('items.firstGenerationEmail.description')}
          label={t('items.firstGenerationEmail.label')}
          onCheckedChange={setFirstGenerationEmail}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="font-medium text-base">{dict.requiredEmailsTitle}</h3>
          <p className="text-muted-foreground text-sm">
            {dict.requiredEmailsDescription}
          </p>
        </div>

        <StaticPreference
          description={t('items.topupSuccess.description')}
          label={t('items.topupSuccess.label')}
        />
        <StaticPreference
          description={t('items.subscriptionSuccess.description')}
          label={t('items.subscriptionSuccess.label')}
        />
        <StaticPreference
          description={t('items.subscriptionCancellation.description')}
          label={t('items.subscriptionCancellation.label')}
        />
        <StaticPreference
          description={t('items.lowCreditAlert.description')}
          label={t('items.lowCreditAlert.label')}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={isPending} type="submit">
          {isPending ? dict.saving : dict.save}
        </Button>
      </div>
    </form>
  );
}

function PreferenceCheckbox({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-4">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <div className="space-y-1">
        <div className="font-medium text-sm">{label}</div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </label>
  );
}

function StaticPreference({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
      <Checkbox checked className="mt-0.5" disabled />
      <div className="space-y-1">
        <div className="font-medium text-sm">{label}</div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
