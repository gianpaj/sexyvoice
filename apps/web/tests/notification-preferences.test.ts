import { describe, expect, it } from 'vitest';

import {
  getDefaultOptionalEmailNotificationPreferences,
  resolveOptionalEmailNotificationPreferences,
} from '@/lib/notifications/preferences';

describe('resolveOptionalEmailNotificationPreferences', () => {
  it('defaults all optional email preferences to enabled', () => {
    expect(getDefaultOptionalEmailNotificationPreferences()).toEqual({
      welcome_email: true,
      first_generation_email: true,
    });
  });

  it('overrides defaults with stored email preference rows', () => {
    expect(
      resolveOptionalEmailNotificationPreferences([
        {
          channel: 'email',
          preference_key: 'welcome_email',
          enabled: false,
        },
        {
          channel: 'email',
          preference_key: 'first_generation_email',
          enabled: true,
        },
      ]),
    ).toEqual({
      welcome_email: false,
      first_generation_email: true,
    });
  });
});
