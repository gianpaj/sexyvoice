import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({
  path: ['.env', '.env.local'],
});

interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'topup' | 'usage' | 'freemium' | 'refund';
  description: string;
  metadata: {
    dollarAmount?: number;
    priceId?: string;
    chargeId?: string;
    [key: string]: unknown;
  } | null;
  reference_id: string | null;
  created_at: string;
}

interface AudioFile {
  id: string;
  credits_used: number;
  created_at: string;
}

interface RefundCalculation {
  totalPurchased: number;
  totalUsed: number;
  totalRefunded: number;
  availableCredits: number;
  totalSpentUSD: number;
  creditRate: number;
  maxRefundCredits: number;
  maxRefundUSD: number;
  purchaseTransactions: CreditTransaction[];
}

/**
 * Create Supabase admin client
 */
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
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/**
 * Get all credit transactions for a user
 */
async function getCreditTransactions(
  userId: string,
): Promise<CreditTransaction[]> {
  const supabase = createAdminClient();

  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    console.warn('Using local Supabase URL');
  } else {
    console.warn('Using production Supabase URL');
  }

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch credit transactions: ${error.message}`);
  }

  return data as CreditTransaction[];
}

/**
 * Get user's credit balance from credits table
 */
async function getUserCreditBalance(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch user credit balance: ${error.message}`);
  }

  return data?.amount || 0;
}

/**
 * Get total credits used by user from audio files
 */
async function getTotalCreditsUsed(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('audio_files')
    .select('credits_used')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch audio files: ${error.message}`);
  }

  const audioFiles = data as AudioFile[];
  return audioFiles.reduce((sum, file) => sum + (file.credits_used || 0), 0);
}

/**
 * Calculate refund information
 */
function calculateRefund(
  transactions: CreditTransaction[],
  totalCreditsUsed: number,
): RefundCalculation {
  // Filter purchase and topup transactions with dollar amounts
  const purchaseTransactions = transactions.filter(
    (t) =>
      (t.type === 'purchase' || t.type === 'topup') &&
      t.metadata?.dollarAmount &&
      t.metadata.dollarAmount > 0,
  );

  if (purchaseTransactions.length === 0) {
    throw new Error(
      'User has no valid purchase or topup transactions with dollar amounts',
    );
  }

  // Calculate totals
  const totalPurchased = transactions
    .filter((t) => t.type === 'purchase' || t.type === 'topup')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpentUSD = purchaseTransactions.reduce(
    (sum, t) => sum + (t.metadata?.dollarAmount || 0),
    0,
  );

  // Calculate total freemium credits
  const totalFreemium = transactions
    .filter((t) => t.type === 'freemium')
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate total already refunded
  const totalRefunded = transactions
    .filter((t) => t.type === 'refund')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Calculate available credits: total added (purchase + topup + freemium) minus used and refunded
  const totalCreditsAdded = totalPurchased + totalFreemium;

  const availableCredits = totalCreditsAdded - totalCreditsUsed - totalRefunded;

  // Calculate credit rate (USD per credit)
  const creditRate = totalSpentUSD / totalPurchased;

  const totalPurchaseCreditsUsed = Math.max(
    0,
    totalCreditsUsed - totalFreemium,
  );

  // Max refund is based on purchase unused credits minus already refunded credits
  const unusedCredits =
    totalPurchased - totalPurchaseCreditsUsed - totalRefunded;
  const maxRefundCredits = Math.max(0, unusedCredits);
  const maxRefundUSD = maxRefundCredits * creditRate;

  return {
    totalPurchased,
    totalUsed: totalCreditsUsed,
    totalRefunded,
    availableCredits,
    totalSpentUSD,
    creditRate,
    maxRefundCredits,
    maxRefundUSD,
    purchaseTransactions,
  };
}

/**
 * Insert refund transaction and update credits table
 */
async function insertRefundTransaction(options: {
  userId: string;
  refundCredits: number;
  refundUSD: number;
  originalTransaction: CreditTransaction | null;
  chargeId?: string;
  platformBugReason?: string;
}): Promise<void> {
  const {
    userId,
    refundCredits,
    refundUSD,
    originalTransaction,
    chargeId,
    platformBugReason,
  } = options;
  const supabase = createAdminClient();

  // For platform bug refunds, we're adding credits back (no USD involved)
  // For regular refunds, we're taking credits back (negative USD)
  const isPlatformBugRefund = !!platformBugReason;

  const metadata: {
    dollarAmount?: number;
    chargeId?: string;
    originalTransactionId?: string;
    originalTransactionRefId?: string | null;
    reason?: string;
  } = {};

  // Only set original transaction info for regular refunds (not platform bug refunds)
  if (!isPlatformBugRefund && originalTransaction) {
    metadata.originalTransactionId = originalTransaction.id;
    metadata.originalTransactionRefId = originalTransaction.reference_id;
    metadata.dollarAmount = -Math.abs(refundUSD);
  }

  if (chargeId) {
    metadata.chargeId = chargeId;
  }

  if (platformBugReason) {
    metadata.reason = platformBugReason;
  }

  // Build description
  const description = platformBugReason
    ? `Refund - ${platformBugReason} - ${refundCredits} credits`
    : `Refund for transaction of ${new Date(originalTransaction!.created_at).toISOString().substring(0, 10)} - $${refundUSD.toFixed(2)}`;

  // Insert refund transaction
  // Platform bug refund: positive amount (adding credits back to user)
  // Regular refund: negative amount (taking credits back, giving USD refund)
  const transactionAmount = isPlatformBugRefund
    ? Math.abs(refundCredits)
    : -Math.abs(refundCredits);

  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: transactionAmount,
    type: 'refund',
    description,
    reference_id: isPlatformBugRefund
      ? null
      : originalTransaction!.reference_id,
    metadata,
  });

  if (error) {
    throw new Error(`Failed to insert refund transaction: ${error.message}`);
  }

  // Update credits table
  // Platform bug refund: increment credits (giving credits back)
  // Regular refund: decrement credits (taking credits back)
  if (isPlatformBugRefund) {
    const { error: creditsError } = await supabase.rpc(
      'increment_user_credits',
      {
        user_id_var: userId,
        credit_amount_var: Math.abs(refundCredits),
      },
    );

    if (creditsError) {
      throw new Error(
        `Failed to update credits table: ${creditsError.message}`,
      );
    }
  } else {
    const { error: creditsError } = await supabase.rpc(
      'decrement_user_credits',
      {
        user_id_var: userId,
        credit_amount_var: Math.abs(refundCredits),
      },
    );

    if (creditsError) {
      throw new Error(
        `Failed to update credits table: ${creditsError.message}`,
      );
    }
  }
}

/**
 * Display refund calculation
 */
function displayRefundInfo(calculation: RefundCalculation): void {
  console.log('\n=== Credit Refund Calculation ===\n');
  console.log(`Total Credits Purchased: ${calculation.totalPurchased}`);
  console.log(`Total Credits Used: ${calculation.totalUsed}`);
  console.log(`Total Credits Refunded: ${calculation.totalRefunded}`);
  console.log(`Available Credits: ${calculation.availableCredits}`);
  console.log(`Total Spent: $${calculation.totalSpentUSD.toFixed(2)}`);
  console.log(
    `Credit Rate: $${calculation.creditRate.toFixed(5)} per credit\n`,
  );
  console.log(`Max Refundable Credits: ${calculation.maxRefundCredits}`);
  console.log(`Max Refund Amount: $${calculation.maxRefundUSD.toFixed(2)}\n`);

  console.log('Purchase/Topup Transactions:');
  for (const transaction of calculation.purchaseTransactions) {
    console.log(
      `  - ${transaction.created_at.substring(0, 10)} | ${transaction.type.toUpperCase()} | ${transaction.amount} credits | $${transaction.metadata?.dollarAmount?.toFixed(2)} | Ref: ${transaction.reference_id || 'N/A'}`,
    );
  }
  console.log('');
}

/**
 * Prompt user for input
 */
async function promptUser(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

/**
 * Get and validate user ID
 */
async function getUserId(
  rl: ReturnType<typeof createInterface>,
): Promise<string> {
  let userId = process.argv[2];

  if (!userId) {
    userId = await promptUser(rl, 'Enter user ID: ');
  }

  if (!userId) {
    throw new Error('User ID is required');
  }

  return userId;
}

/**
 * Validate and get refund amount
 */
async function getRefundAmount(
  rl: ReturnType<typeof createInterface>,
  calculation: RefundCalculation,
): Promise<number> {
  const refundCreditsInput = await promptUser(
    rl,
    `Enter number of credits to refund (max ${calculation.maxRefundCredits}): `,
  );

  const refundCredits = Number.parseInt(refundCreditsInput, 10);

  if (Number.isNaN(refundCredits) || refundCredits <= 0) {
    throw new Error('Invalid refund amount');
  }

  if (refundCredits > calculation.maxRefundCredits) {
    throw new Error(
      `Refund amount exceeds maximum of ${calculation.maxRefundCredits} credits`,
    );
  }

  return refundCredits;
}

/**
 * Select transaction to refund
 */
async function selectTransaction(
  rl: ReturnType<typeof createInterface>,
  calculation: RefundCalculation,
): Promise<{ transaction: CreditTransaction | null; skipped: boolean }> {
  console.log('\nSelect transaction to refund:');
  for (let i = 0; i < calculation.purchaseTransactions.length; i++) {
    const t = calculation.purchaseTransactions[i];
    console.log(
      `  ${i + 1}. ${t.created_at.substring(0, 10)} | ${t.amount} credits | $${t.metadata?.dollarAmount?.toFixed(2)} | Ref: ${t.reference_id || 'N/A'}`,
    );
  }

  const transactionIndexInput = await promptUser(
    rl,
    '\nEnter transaction number (or press Enter to skip for platform bug refund): ',
  );

  // If skipped, don't use any transaction (platform bug refund)
  if (transactionIndexInput === '') {
    console.log(
      '\n💡 Skipped transaction selection for platform bug refund (no original transaction will be tracked)',
    );
    return { transaction: null, skipped: true };
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
    transaction: calculation.purchaseTransactions[transactionIndex],
    skipped: false,
  };
}

/**
 * Get refund dollar amount with suggestion
 */
async function getRefundDollarAmount(
  rl: ReturnType<typeof createInterface>,
  refundCredits: number,
  selectedTransaction: CreditTransaction,
  creditRate: number,
): Promise<number> {
  // Calculate suggested dollar amount
  let suggestedUSD = refundCredits * creditRate;

  // If refunding exact transaction amount, suggest that transaction's dollar amount
  if (
    refundCredits === selectedTransaction.amount &&
    selectedTransaction.metadata?.dollarAmount
  ) {
    suggestedUSD = selectedTransaction.metadata.dollarAmount;
    console.log(
      `\n💡 Note: Refunding full transaction amount. Suggested refund: $${suggestedUSD.toFixed(2)}`,
    );
  } else {
    console.log(
      `\nCalculated refund based on credit rate: $${suggestedUSD.toFixed(2)}`,
    );
  }

  // Prompt for dollar amount with suggestion
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

/**
 * Main function
 */
async function main() {
  const rl = createInterface({ input, output });

  try {
    const userId = await getUserId(rl);
    console.log(`\nProcessing refund for user: ${userId}\n`);

    // Fetch data
    console.log('Fetching credit transactions...');
    const transactions = await getCreditTransactions(userId);

    console.log('Calculating credits used...');
    const totalCreditsUsed = await getTotalCreditsUsed(userId);

    console.log('Fetching user credit balance...');
    const userCreditBalance = await getUserCreditBalance(userId);

    // Check if user has only freemium transactions
    const hasPaidTransactions = transactions.some(
      (t) =>
        (t.type === 'purchase' || t.type === 'topup') &&
        t.metadata?.dollarAmount &&
        t.metadata.dollarAmount > 0,
    );

    if (!hasPaidTransactions) {
      console.log(
        '\n❌ Error: User has no paid transactions. Only freemium users cannot be refunded.\n',
      );
      rl.close();
      return;
    }

    // Calculate refund
    const calculation = calculateRefund(transactions, totalCreditsUsed);

    // Validate that calculated available credits match the credits table
    if (calculation.availableCredits !== userCreditBalance) {
      throw new Error(
        'Credit mismatch detected!\n' +
          `  Calculated from transactions: ${calculation.availableCredits}\n` +
          `  Actual balance in credits table: ${userCreditBalance}\n` +
          '  Please investigate data integrity before processing refund.',
      );
    }

    // Display info
    displayRefundInfo(calculation);

    if (calculation.maxRefundCredits <= 0) {
      console.log(
        '❌ No refund available. User has used all or more credits than purchased.\n',
      );
      rl.close();
      return;
    }

    // Get refund amount
    const refundCredits = await getRefundAmount(rl, calculation);

    // Select transaction to refund
    const { transaction: selectedTransaction, skipped: isPlatformBugRefund } =
      await selectTransaction(rl, calculation);

    // Get reason for platform bug refund (credits only, no USD refund)
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
      // Get dollar amount to refund (only for regular refunds)
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

    // Optional charge ID
    const chargeId = await promptUser(
      rl,
      'Enter Stripe charge ID (ch_...) [optional, press Enter to skip]: ',
    );

    // Confirmation
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
        `Original transaction: ${selectedTransaction.id.substring(0, 8)}`,
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
      rl.close();
      return;
    }

    // Insert refund transaction
    console.log('\nProcessing refund...');
    await insertRefundTransaction({
      userId,
      refundCredits,
      refundUSD,
      originalTransaction: selectedTransaction,
      chargeId: chargeId || undefined,
      platformBugReason,
    });

    console.log('✅ Refund transaction created successfully!\n');
  } catch (error) {
    console.error(
      '\n❌ Error:',
      Error.isError(error) ? error.message : error,
      '\n',
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
main();
