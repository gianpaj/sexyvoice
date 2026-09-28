import 'server-only';

import { cookies } from 'next/headers';

import { E2E_CALL_USER_COOKIE } from './e2e-mocks-shared';
import { isE2E } from './e2e-mode';

export async function getE2ECallUser() {
  if (!isE2E()) return null;

  const cookieStore = await cookies();
  return {
    isPaidUser: cookieStore.get(E2E_CALL_USER_COOKIE)?.value === 'paid',
  };
}
