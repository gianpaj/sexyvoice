import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { BillingUsageChart } from './billing-usage-chart';

export default async function ApiBillingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h2 className="font-semibold text-2xl">
          {dict.pages['/dashboard/api-billing']}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {dict.apiBilling.description}
        </p>
      </div>
      <BillingUsageChart />
    </div>
  );
}
