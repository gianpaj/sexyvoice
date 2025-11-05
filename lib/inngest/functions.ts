import { logger } from '@sentry/nextjs';
import { del } from '@vercel/blob';

import { inngest } from './client';

const CLONE_AUDIO_CLEANUP_DELAY = '1h';

async function sendSlackNotification(data: {
  userId: string;
  userEmail: string;
  amount: number;
  planType: string;
  credits: number;
  paymentIntentId: string;
}) {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    console.warn('SLACK_WEBHOOK_URL not configured, skipping Slack notification');
    return;
  }

  const message = {
    text: '💰 Pro Plan Purchase',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '💰 New Pro Plan Purchase ($99)',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*User Email:*\n${data.userEmail}`,
          },
          {
            type: 'mrkdwn',
            text: `*User ID:*\n${data.userId}`,
          },
          {
            type: 'mrkdwn',
            text: `*Amount:*\n$${data.amount}`,
          },
          {
            type: 'mrkdwn',
            text: `*Type:*\n${data.planType === 'subscription' ? '🔄 Subscription' : '💳 One-time'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Credits:*\n${data.credits.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Payment Intent:*\n${data.paymentIntentId}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
          },
        ],
      },
    ],
  };

  const response = await fetch(slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.statusText}`);
  }
}

async function sendTelegramNotification(data: {
  userId: string;
  userEmail: string;
  amount: number;
  planType: string;
  credits: number;
  paymentIntentId: string;
}) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken || !telegramChatId) {
    console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured, skipping Telegram notification');
    return;
  }

  const planTypeEmoji = data.planType === 'subscription' ? '🔄' : '💳';
  const planTypeText = data.planType === 'subscription' ? 'Subscription' : 'One-time';

  const message = `💰 *New Pro Plan Purchase \\($99\\)*

👤 *User:* ${data.userEmail}
🆔 *User ID:* \`${data.userId}\`
💵 *Amount:* $${data.amount}
${planTypeEmoji} *Type:* ${planTypeText}
⭐ *Credits:* ${data.credits.toLocaleString()}
🔑 *Payment Intent:* \`${data.paymentIntentId}\`

🕐 ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;

  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'MarkdownV2',
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram notification failed: ${response.statusText} - ${errorText}`);
  }
}

export const cleanupCloneAudio = inngest.createFunction(
  { id: 'cleanup-clone-audio' },
  { event: 'clone-audio/cleanup.scheduled' },
  async ({ event, step }) => {
    await step.sleep('wait-1-hour', CLONE_AUDIO_CLEANUP_DELAY);

    await step.run('delete-audio', async () => {
      await del(event.data.blobUrl);
      console.log(
        'User:',
        event.data.userId,
        'Cleaned up:',
        event.data.blobUrl,
      );
      logger.info('Cleaned up clone audio file', {
        extra: {
          userId: event.data.userId,
          blobUrl: event.data.blobUrl,
        },
      });
    });
  },
);

export const notifyProPlanPurchase = inngest.createFunction(
  {
    id: 'notify-pro-plan-purchase',
    name: 'Notify Pro Plan Purchase',
  },
  { event: 'payment/pro-plan-purchased' },
  async ({ event, step }) => {
    const { userId, userEmail, amount, planType, credits, paymentIntentId, priceId } =
      event.data;

    // Send Slack notification
    await step.run('send-slack-notification', async () => {
      try {
        await sendSlackNotification({
          userId,
          userEmail,
          amount,
          planType,
          credits,
          paymentIntentId,
        });
        logger.info('Sent Slack notification for Pro plan purchase', {
          extra: { userId, userEmail, amount, planType, priceId },
        });
      } catch (error) {
        logger.error('Failed to send Slack notification', {
          extra: { userId, userEmail, error },
        });
        // Don't throw - continue to Telegram notification
      }
    });

    // Send Telegram notification
    await step.run('send-telegram-notification', async () => {
      try {
        await sendTelegramNotification({
          userId,
          userEmail,
          amount,
          planType,
          credits,
          paymentIntentId,
        });
        logger.info('Sent Telegram notification for Pro plan purchase', {
          extra: { userId, userEmail, amount, planType, priceId },
        });
      } catch (error) {
        logger.error('Failed to send Telegram notification', {
          extra: { userId, userEmail, error },
        });
        // Don't throw - allow function to complete
      }
    });

    return {
      success: true,
      userId,
      userEmail,
      amount,
    };
  },
);
