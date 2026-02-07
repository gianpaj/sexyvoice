import { redirect } from 'next/navigation';

import type { Locale } from '@/lib/i18n/i18n-config';
import type { Message } from '../../(auth)/reset-password/reset-password-form';

export default async function DashboardPage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<Message>;
}) {
  const params = await props.params;

  redirect(`/${params.lang}/dashboard/call`);
}

// {'success' in searchParams && (
//   <div className="text-foreground border-l-2 border-green-500 px-4 text-sm">
//     {searchParams.success === 'passwords_updated'
//       ? dict.auth.updatePassword.errors.success
//       : searchParams.success}
//   </div>
// )}
