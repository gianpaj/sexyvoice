import {
  DEFAULT_OPTIONAL_EMAIL_NOTIFICATION_PREFERENCES,
  OPTIONAL_EMAIL_PREFERENCE_KEYS,
  type OptionalEmailPreferenceKey,
} from '@/lib/notifications/types';

type PreferenceRow = {
  channel: string;
  enabled: boolean;
  preference_key: string;
};

export type OptionalEmailNotificationPreferences = Record<
  OptionalEmailPreferenceKey,
  boolean
>;

export const isOptionalEmailPreferenceKey = (
  value: string,
): value is OptionalEmailPreferenceKey =>
  Object.values(OPTIONAL_EMAIL_PREFERENCE_KEYS).includes(
    value as OptionalEmailPreferenceKey,
  );

export const getDefaultOptionalEmailNotificationPreferences =
  (): OptionalEmailNotificationPreferences => ({
    ...DEFAULT_OPTIONAL_EMAIL_NOTIFICATION_PREFERENCES,
  });

export const resolveOptionalEmailNotificationPreferences = (
  rows: PreferenceRow[],
): OptionalEmailNotificationPreferences => {
  const resolved = getDefaultOptionalEmailNotificationPreferences();

  for (const row of rows) {
    if (row.channel !== 'email' || !isOptionalEmailPreferenceKey(row.preference_key)) {
      continue;
    }

    resolved[row.preference_key] = row.enabled;
  }

  return resolved;
};
