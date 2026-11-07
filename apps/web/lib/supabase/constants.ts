export const OAUTH_CALLBACK_COOKIE_NAME = 'sv_oauth_callback_ok';

export const CREDITS_PER_MINUTE = 1000;
/** A call needs one minute of credits to start. */
export const MINIMUM_CREDITS_FOR_CALL = CREDITS_PER_MINUTE;

// 5 minutes in seconds - free users can only make calls up to this limit
export const FREE_USER_CALL_LIMIT_SECONDS = 5 * 60;
