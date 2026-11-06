import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { loadScriptEnv, parseCliArgs, runScript } from './lib/cli.mts';
import {
  adjustCredits,
  type CreditTransaction,
  dollarAmount,
  hasCashPurchase,
  isCashPayment,
  type LedgerSummary,
  readBalances,
  readCreditTransactions,
  readUsageEvents,
  refundPayment,
  summarizeLedger,
} from './lib/ledger.mts';
import { createScriptAdminClient } from './lib/supabase.mts';
import { UUID_PATTERN } from './lib/uuid.mts';

const HELP = `Refund one user's credits interactively: a cash refund against a
purchase, or a credits-only platform-bug refund. Prompts for every amount and
asks for confirmation before writing.

A cash refund is capped at the balance and at the purchased credits not yet
taken back, priced at the user's average credit rate unless the whole
purchase is refunded.

Usage: pnpm refund-credits [user-id]`;

interface RefundCalculation {
  creditRate: number;
  ledger: LedgerSummary;
  maxRefundCredits: number;
  maxRefundUSD: number;
  purchaseTransactions: CreditTransaction[];
  stillOwedCredits: number;
}

function calculateRefund(
  transactions: CreditTransaction[],
  balance: number,
  creditsUsed: number,
): RefundCalculation {
  const purchaseTransactions = transactions.filter(isCashPayment);
  if (purchaseTransactions.length === 0) {
    throw new Error(
      'User has no valid purchase or topup transactions with dollar amounts',
    );
  }

  const ledger = summarizeLedger(transactions, creditsUsed, balance);
  const creditRate = ledger.charged / ledger.purchased;

  // Cap a cash refund at the balance and at the purchased credits not taken
  // back already, so freemium credits never turn into cash.
  const maxRefundCredits = Math.max(
    0,
    Math.min(balance, ledger.purchased - ledger.refundsRemoved),
  );

  return {
    creditRate,
    ledger,
    maxRefundCredits,
    maxRefundUSD: maxRefundCredits * creditRate,
    purchaseTransactions,
    // Credits gone without recorded usage that no credits-only refund has
    // added back yet.
    stillOwedCredits: Math.max(0, -ledger.delta - ledger.refundsAdded),
  };
}

function formatDollars(transaction: CreditTransaction): string | undefined {
  return dollarAmount(transaction)?.toFixed(2);
}

function displayRefundInfo(calculation: RefundCalculation): void {
  const { ledger } = calculation;
  const refundAdjustment = ledger.refundsAdded - ledger.refundsRemoved;
  console.log('\n=== Credit Refund Calculation ===\n');
  console.log(`Total Credits Purchased:       ${ledger.purchased}`);
  console.log(`Total Freemium Credits:        ${ledger.freemium}`);
  console.log(`Legitimate Usage (events):     ${ledger.creditsUsed}`);
  console.log(`Available Credits (balance):   ${ledger.balance}`);
  console.log(
    `Refund Adjustment (all):       ${refundAdjustment >= 0 ? '+' : ''}${refundAdjustment}`,
  );
  console.log(`Credits Refunded:              ${ledger.refundsRemoved}`);
  if (calculation.stillOwedCredits > 0) {
    console.log(
      `\n⚠️  Still owed to user:         ${calculation.stillOwedCredits} credits (overcharged but not yet refunded)`,
    );
  } else {
    console.log('\n✅ Overcharge fully compensated');
  }
  console.log(`Total Spent: $${ledger.charged.toFixed(2)}`);
  console.log(
    `Credit Rate: $${calculation.creditRate.toFixed(5)} per credit\n`,
  );
  console.log(`Max Refundable Credits: ${calculation.maxRefundCredits}`);
  console.log(`Max Refund Amount: $${calculation.maxRefundUSD.toFixed(2)}\n`);

  console.log('Purchase/Topup Transactions:');
  for (const transaction of calculation.purchaseTransactions) {
    console.log(
      `  - ${transaction.created_at.slice(0, 10)} | ${transaction.type.toUpperCase()} | ${transaction.amount} credits | $${formatDollars(transaction)} | Ref: ${transaction.reference_id || 'N/A'}`,
    );
  }
  console.log('');
}

async function promptUser(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

async function getUserId(
  rl: ReturnType<typeof createInterface>,
  argument: string | undefined,
): Promise<string> {
  const userId = argument || (await promptUser(rl, 'Enter user ID: '));
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('Provide the user ID as a UUID');
  }
  return userId;
}

async function getRefundAmount(
  rl: ReturnType<typeof createInterface>,
  calculation: RefundCalculation,
  isPlatformBugRefund: boolean,
): Promise<number> {
  const promptText = isPlatformBugRefund
    ? 'Enter number of credits to refund: '
    : `Enter number of credits to refund (max ${calculation.maxRefundCredits}): `;

  const refundCreditsInput = await promptUser(rl, promptText);

  const refundCredits = Number.parseInt(refundCreditsInput, 10);

  if (Number.isNaN(refundCredits) || refundCredits <= 0) {
    throw new Error('Invalid refund amount');
  }

  // Only purchase refunds have a maximum; platform-bug refunds add credits.
  if (!isPlatformBugRefund && refundCredits > calculation.maxRefundCredits) {
    throw new Error(
      `Refund amount exceeds maximum of ${calculation.maxRefundCredits} credits`,
    );
  }

  return refundCredits;
}

async function selectTransaction(
  rl: ReturnType<typeof createInterface>,
  calculation: RefundCalculation,
): Promise<{ transaction: CreditTransaction | null; skipped: boolean }> {
  console.log('\nSelect transaction to refund:');
  for (let i = 0; i < calculation.purchaseTransactions.length; i++) {
    const t = calculation.purchaseTransactions[i];
    console.log(
      `  ${i + 1}. ${t.created_at.slice(0, 10)} | ${t.amount} credits | $${formatDollars(t)} | Ref: ${t.reference_id || 'N/A'}`,
    );
  }

  const transactionIndexInput = await promptUser(
    rl,
    '\nEnter transaction number (or press Enter to skip for platform bug refund): ',
  );

  if (transactionIndexInput === '') {
    console.log(
      '\n💡 Skipped transaction selection for platform bug refund (no original transaction will be tracked)',
    );
    return { skipped: true, transaction: null };
  }

  const transactionIndex = Number.parseInt(transactionIndexInput, 10) - 1;

  if (
    Number.isNaN(transactionIndex) ||
    transactionIndex < 0 ||
    transactionIndex >= calculation.purchaseTransactions.length
  ) {
    throw new Error('Invalid transaction selection');
  }

  return {
    skipped: false,
    transaction: calculation.purchaseTransactions[transactionIndex],
  };
}

async function getRefundDollarAmount(
  rl: ReturnType<typeof createInterface>,
  refundCredits: number,
  selectedTransaction: CreditTransaction,
  creditRate: number,
): Promise<number> {
  let suggestedUSD = refundCredits * creditRate;

  // A whole-purchase refund suggests that purchase's own price.
  const purchaseDollars = dollarAmount(selectedTransaction);
  if (refundCredits === selectedTransaction.amount && purchaseDollars) {
    suggestedUSD = purchaseDollars;
    console.log(
      `\n💡 Note: Refunding full transaction amount. Suggested refund: $${suggestedUSD.toFixed(2)}`,
    );
  } else {
    console.log(
      `\nCalculated refund based on credit rate: $${suggestedUSD.toFixed(2)}`,
    );
  }

  const refundUSDInput = await promptUser(
    rl,
    `Enter USD amount to refund [suggested: $${suggestedUSD.toFixed(2)}]: `,
  );

  const refundUSD = refundUSDInput.trim()
    ? Number.parseFloat(refundUSDInput)
    : suggestedUSD;

  if (Number.isNaN(refundUSD) || refundUSD <= 0) {
    throw new Error('Invalid refund USD amount');
  }

  return refundUSD;
}

async function main() {
  const { positionals, values } = parseCliArgs({
    allowPositionals: true,
    options: { help: { default: false, short: 'h', type: 'boolean' } },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (positionals.length > 1) {
    throw new Error(`Expected at most one user ID.\n\n${HELP}`);
  }

  const rl = createInterface({ input, output });

  try {
    const userId = await getUserId(rl, positionals[0]);
    loadScriptEnv();
    const supabase = createScriptAdminClient();
    console.log(`\nProcessing refund for user: ${userId}\n`);

    console.log('Fetching credit transactions...');
    const transactions = await readCreditTransactions(supabase, [userId]);

    console.log('Fetching user credit balance...');
    const [balances, usageEvents] = await Promise.all([
      readBalances(supabase, [userId]),
      readUsageEvents(supabase, [userId]),
    ]);
    const balance = balances.get(userId);
    if (!balance) {
      throw new Error('User has no credits row');
    }
    const creditsUsed = usageEvents.reduce(
      (sum, event) => sum + event.credits_used,
      0,
    );

    if (!hasCashPurchase(transactions)) {
      console.log(
        '\n❌ Error: User has no paid transactions. Only freemium users cannot be refunded.\n',
      );
      return;
    }

    const calculation = calculateRefund(
      transactions,
      balance.amount,
      creditsUsed,
    );

    displayRefundInfo(calculation);

    const { transaction: selectedTransaction, skipped: isPlatformBugRefund } =
      await selectTransaction(rl, calculation);

    if (!isPlatformBugRefund && calculation.maxRefundCredits <= 0) {
      console.log(
        '❌ No purchase refund available. User has used all or more credits than purchased.\n',
      );
      console.log(
        '💡 Tip: Press Enter at transaction selection to do a platform bug refund (credits-only).\n',
      );
      return;
    }

    const refundCredits = await getRefundAmount(
      rl,
      calculation,
      isPlatformBugRefund,
    );

    let platformBugReason: string | undefined;
    let refundUSD = 0;

    if (isPlatformBugRefund) {
      const reasonInput = await promptUser(
        rl,
        'Enter refund reason [default: Platform bug]: ',
      );
      platformBugReason = reasonInput || 'Platform bug';
      console.log(
        `\nRefund: ${refundCredits} credits (credits only, no USD refund)`,
      );
    } else {
      refundUSD = await getRefundDollarAmount(
        rl,
        refundCredits,
        selectedTransaction!,
        calculation.creditRate,
      );
      console.log(
        `\nRefund: ${refundCredits} credits = $${refundUSD.toFixed(2)}`,
      );
    }

    const chargeId = await promptUser(
      rl,
      'Enter Stripe charge ID (ch_...) [optional, press Enter to skip]: ',
    );

    console.log('\n=== Refund Summary ===');
    console.log(`User ID: ${userId}`);
    console.log(`Credits to refund: ${refundCredits}`);
    if (platformBugReason) {
      console.log('USD to refund: $0.00 (credits only)');
      console.log(`Reason: ${platformBugReason}`);
    } else {
      console.log(`USD to refund: $${refundUSD.toFixed(2)}`);
    }
    if (selectedTransaction) {
      console.log(
        `Original transaction: ${selectedTransaction.id.slice(0, 8)}`,
      );
      console.log(`Reference ID: ${selectedTransaction.reference_id || 'N/A'}`);
    }
    if (chargeId) {
      console.log(`Charge ID: ${chargeId}`);
    }
    console.log('');

    const confirm = await promptUser(rl, 'Confirm refund? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Refund cancelled.\n');
      return;
    }

    console.log('\nProcessing refund...');
    if (platformBugReason) {
      await adjustCredits(supabase, {
        amount: refundCredits,
        description: `Refund - ${platformBugReason}`,
        metadata: chargeId ? { chargeId } : undefined,
        reason: platformBugReason,
        userId,
      });
    } else {
      await refundPayment(supabase, {
        chargeId: chargeId || undefined,
        credits: refundCredits,
        dollars: refundUSD,
        payment: selectedTransaction!,
        userId,
      });
    }

    console.log('✅ Refund transaction created successfully!\n');
  } finally {
    rl.close();
  }
}

runScript(import.meta.url, main);
