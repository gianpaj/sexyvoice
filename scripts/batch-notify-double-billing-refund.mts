import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { Resend } from 'resend';

config({ path: ['.env', '.env.local'] });

const DEDUPE_KEY_PREFIX = 'double-billing-refund-voice-call-2025';
const EVENT_NAME = 'app/billing.double-charge.refunded';
const TEMPLATE_KEY = 'double_billing_refund';
const REFUND_REASON_METADATA = 'Double billing - voice call';

interface CsvRow {
  refundCredits: number;
  userId: string;
}

interface SendResult {
  email: string | null;
  reason?: string;
  refundCredits: number;
  status: 'sent' | 'skipped' | 'failed';
  userId: string;
}

function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function parseCsv(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV has no data rows');
  }

  const headers = lines[0].trim().toLowerCase().split(',');
  const iUserId = headers.indexOf('user_id');
  const iCredits = headers.indexOf('refund_credits');

  if (iUserId === -1 || iCredits === -1) {
    throw new Error('CSV missing required columns: user_id, refund_credits');
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = line.split(',');
    const userId = fields[iUserId]?.trim();
    const refundCredits = Number.parseInt(fields[iCredits]?.trim(), 10);
    if (!userId || Number.isNaN(refundCredits) || refundCredits <= 0) {
      console.warn(`  Row ${i}: skipping — invalid data`);
      continue;
    }
    rows.push({ userId, refundCredits });
  }
  return rows;
}

async function getUserEmail(userId: string): Promise<{ email: string | null }> {
  const admin = createAdminClient();
  const userResult = await admin.auth.admin.getUserById(userId);

  if (userResult.error)
    throw new Error(`auth lookup: ${userResult.error.message}`);

  return { email: userResult.data.user?.email ?? null };
}

async function checkAlreadySent(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('notification_events')
    .select('id')
    .eq('event_name', EVENT_NAME)
    .eq('dedupe_key', `${DEDUPE_KEY_PREFIX}:${userId}`)
    .maybeSingle();

  return data !== null;
}

async function recordNotificationEvent(
  userId: string,
  refundCredits: number,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notification_events')
    .upsert(
      [
        {
          user_id: userId,
          event_name: EVENT_NAME,
          source_type: 'platform_bug_fix',
          source_id: null,
          dedupe_key: `${DEDUPE_KEY_PREFIX}:${userId}`,
          payload: { refundCredits, reason: REFUND_REASON_METADATA },
        },
      ],
      { onConflict: 'event_name,dedupe_key', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`notification_events insert: ${error.message}`);
  return data?.id ?? null;
}

async function recordNotificationDelivery(params: {
  notificationEventId: string;
  userId: string;
  recipient: string;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('notification_deliveries').insert({
    notification_event_id: params.notificationEventId,
    user_id: params.userId,
    channel: 'email',
    template_key: TEMPLATE_KEY,
    provider: 'resend',
    recipient: params.recipient,
    status: params.status,
    provider_message_id: params.providerMessageId ?? null,
    error_message: params.errorMessage ?? null,
    sent_at: params.sentAt ?? null,
    last_provider_event_at: params.sentAt ?? null,
    metadata: { dedupeKey: `${DEDUPE_KEY_PREFIX}:${params.userId}` },
  });

  if (error)
    throw new Error(`notification_deliveries insert: ${error.message}`);
}

function renderEmailHtml(refundCredits: number): string {
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sexyvoice.ai';
  const creditsUrl = `${appUrl}/en/dashboard/credits`;
  const formatted = new Intl.NumberFormat('en-US').format(
    Math.max(0, refundCredits),
  );

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="background:#f6f9fc;font-family:Inter,Arial,sans-serif;margin:0;padding:0;">
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;margin:24px auto;max-width:560px;padding:24px;">
    <h1 style="font-size:24px;margin:0 0 8px;color:#111827;">Billing correction applied</h1>
    <p style="color:#4b5563;font-size:14px;margin:0 0 16px;">We identified and fixed a double-billing issue affecting voice call sessions.</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
      <p style="font-size:14px;margin:0 0 12px;color:#111827;">
        We identified and fixed a platform bug in the Call feature. Your account was affected and we have automatically restored <strong>${formatted} credits</strong> to your balance.
      </p>
      <p style="font-size:14px;margin:0 0 12px;color:#111827;">
        This is a credits-only adjustment — no cash was charged or refunded. Your balance has already been updated.
      </p>
      <p style="font-size:14px;margin:0;color:#111827;">
        We apologize for the inconvenience. If you have any questions, please reply to this email or reach out to support.
      </p>
    </div>
    <div style="margin-top:24px;">
      <a href="${creditsUrl}" style="background:#111827;border-radius:8px;color:#ffffff;display:inline-block;font-size:14px;font-weight:600;padding:12px 18px;text-decoration:none;">View your credits</a>
    </div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="color:#6b7280;font-size:12px;margin:0;">You are receiving this transactional email because it is related to your SV account activity.</p>
  </div>
</body>
</html>`;
}

async function sendEmail(params: {
  to: string;
  refundCredits: number;
}): Promise<{ sent: boolean; messageId?: string; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!(apiKey && from)) {
    return { sent: false, reason: 'resend_not_configured' };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: `SV <${from}>`,
    to: [params.to],
    subject: 'A billing correction has been applied to your account',
    html: renderEmailHtml(params.refundCredits),
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { sent: true, messageId: result.data?.id ?? undefined };
}

async function processUser(
  userId: string,
  refundCredits: number,
  isDryRun: boolean,
): Promise<SendResult> {
  const [{ email }, alreadySent] = await Promise.all([
    getUserEmail(userId),
    checkAlreadySent(userId),
  ]);
  if (alreadySent) {
    return {
      userId,
      email,
      refundCredits,
      status: 'skipped',
      reason: 'already sent',
    };
  }

  if (isDryRun) {
    return {
      userId,
      email,
      refundCredits,
      status: 'skipped',
      reason: 'dry run',
    };
  }

  const notificationEventId = await recordNotificationEvent(
    userId,
    refundCredits,
  );

  if (!notificationEventId) {
    return {
      userId,
      email,
      refundCredits,
      status: 'skipped',
      reason: 'duplicate event (race)',
    };
  }

  if (!email) {
    await recordNotificationDelivery({
      notificationEventId,
      userId,
      recipient: '',
      status: 'failed',
      errorMessage: 'missing_email',
    });
    return {
      userId,
      email: null,
      refundCredits,
      status: 'failed',
      reason: 'missing_email',
    };
  }

  try {
    const result = await sendEmail({ to: email, refundCredits });

    await recordNotificationDelivery({
      notificationEventId,
      userId,
      recipient: email,
      status: result.sent ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      errorMessage: result.sent ? null : (result.reason ?? null),
      sentAt: result.sent ? new Date().toISOString() : null,
    });

    return {
      userId,
      email,
      refundCredits,
      status: result.sent ? 'sent' : 'failed',
      reason: result.sent ? undefined : result.reason,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordNotificationDelivery({
      notificationEventId,
      userId,
      recipient: email,
      status: 'failed',
      errorMessage: msg,
    });
    return { userId, email, refundCredits, status: 'failed', reason: msg };
  }
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error(
      'Usage: tsx batch-notify-double-billing-refund.mts <path-to-users.csv> [--dry-run]',
    );
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');

  console.log(`Parsing CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);

  if (rows.length === 0) {
    console.log('No rows to process.');
    process.exit(0);
  }

  const totalCredits = rows.reduce((s, r) => s + r.refundCredits, 0);

  console.log('\n=== Batch Billing Correction Email ===');
  console.log(`Users to notify : ${rows.length}`);
  console.log(`Total credits   : ${totalCredits.toLocaleString()}`);
  console.log(`Supabase URL    : ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(
    `Resend from     : ${process.env.RESEND_FROM_EMAIL ?? '(not set)'}`,
  );
  if (isDryRun) console.log('\n[DRY RUN — no emails will be sent]');
  console.log('');

  const rl = createInterface({ input, output });
  const confirm = (await rl.question('Proceed? (yes/no): '))
    .trim()
    .toLowerCase();
  rl.close();

  if (confirm !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }

  const results: SendResult[] = [];
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const { userId, refundCredits } = rows[i];
    const prefix = `[${i + 1}/${rows.length}]`;
    process.stdout.write(
      `${prefix} user=${userId.substring(0, 8)} credits=${refundCredits.toLocaleString()} ... `,
    );

    try {
      const result = await processUser(userId, refundCredits, isDryRun);
      results.push(result);

      switch (result.status) {
        case 'sent':
          console.log(`sent → ${result.email}`);
          sentCount++;
          break;
        case 'skipped':
          console.log(`skipped (${result.reason})`);
          skippedCount++;
          break;
        case 'failed':
          console.log(`FAILED: ${result.reason}`);
          failedCount++;
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      failedCount++;
      results.push({
        userId,
        email: null,
        refundCredits,
        status: 'failed',
        reason: msg,
      });
    }
  }

  console.log('\n=== Done ===');
  console.log(`Sent    : ${sentCount}`);
  console.log(`Skipped : ${skippedCount}`);
  console.log(`Failed  : ${failedCount}`);

  if (failedCount > 0) {
    console.log('\nFailed users:');
    for (const r of results.filter((r) => r.status === 'failed')) {
      console.log(`  user=${r.userId} email=${r.email ?? 'n/a'} — ${r.reason}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
