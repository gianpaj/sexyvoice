#!/usr/bin/env node

/**
 * Script to analyze free users who registered in the last 30 days
 * and have used most of their free credits (< 300 remaining).
 *
 * Run with: pnpm analyze-free-users
 * Or directly: node --env-file=.env scripts/analyze-free-users.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  console.log(`Analyzing users registered since: ${thirtyDaysAgoISO}\n`);

  // Step 1: Get all profiles registered in last 30 days
  const { data: recentProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, created_at')
    .gte('created_at', thirtyDaysAgoISO)
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    process.exit(1);
  }

  console.log(`Found ${recentProfiles.length} users registered in the last 30 days\n`);

  if (recentProfiles.length === 0) {
    console.log('No users found. Exiting.');
    return;
  }

  const userIds = recentProfiles.map((p) => p.id);

  // Step 2: Get users who have paid (purchase or topup transactions)
  const { data: paidTransactions, error: paidError } = await supabase
    .from('credit_transactions')
    .select('user_id')
    .in('user_id', userIds)
    .in('type', ['purchase', 'topup']);

  if (paidError) {
    console.error('Error fetching paid transactions:', paidError);
    process.exit(1);
  }

  const paidUserIds = new Set(paidTransactions.map((t) => t.user_id));
  const freeUserIds = userIds.filter((id) => !paidUserIds.has(id));

  console.log(`Users who never paid: ${freeUserIds.length}`);
  console.log(`Users who paid: ${paidUserIds.size}\n`);

  if (freeUserIds.length === 0) {
    console.log('All users have paid. Exiting.');
    return;
  }

  // Step 3: Get credits for free users with < 300 credits remaining
  const { data: lowCreditUsers, error: creditsError } = await supabase
    .from('credits')
    .select('user_id, amount')
    .in('user_id', freeUserIds)
    .lt('amount', 300);

  if (creditsError) {
    console.error('Error fetching credits:', creditsError);
    process.exit(1);
  }

  console.log(`Free users with < 300 credits remaining: ${lowCreditUsers.length}\n`);

  if (lowCreditUsers.length === 0) {
    console.log('No free users with low credits found. Exiting.');
    return;
  }

  const lowCreditUserIds = lowCreditUsers.map((c) => c.user_id);
  const creditsMap = new Map(lowCreditUsers.map((c) => [c.user_id, c.amount]));

  // Step 4: Get all transactions for these users to analyze usage patterns
  const { data: allTransactions, error: transactionsError } = await supabase
    .from('credit_transactions')
    .select('user_id, amount, type, created_at')
    .in('user_id', lowCreditUserIds)
    .order('created_at', { ascending: true });

  if (transactionsError) {
    console.error('Error fetching transactions:', transactionsError);
    process.exit(1);
  }

  // Group transactions by user
  const transactionsByUser = new Map();
  for (const tx of allTransactions) {
    if (!transactionsByUser.has(tx.user_id)) {
      transactionsByUser.set(tx.user_id, []);
    }
    transactionsByUser.get(tx.user_id).push(tx);
  }

  // Create lookup for profiles
  const profilesMap = new Map(recentProfiles.map((p) => [p.id, p]));

  // Step 5: Analyze each user
  const results = [];

  for (const userId of lowCreditUserIds) {
    const profile = profilesMap.get(userId);
    const transactions = transactionsByUser.get(userId) || [];
    const currentCredits = creditsMap.get(userId);

    // Find freemium transaction (when they got free credits)
    const freemiumTx = transactions.find((t) => t.type === 'freemium');
    const usageTransactions = transactions.filter((t) => t.type === 'usage');

    // Calculate total credits received and used
    const totalReceived = transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalUsed = Math.abs(
      transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0)
    );

    // Find first and last usage
    const firstUsage = usageTransactions[0];
    const lastUsage = usageTransactions[usageTransactions.length - 1];

    // Calculate time to exhaust credits
    const registrationDate = new Date(profile.created_at);
    let timeToExhaustDays = null;
    let timeToExhaustHours = null;

    if (lastUsage && totalUsed > 0) {
      const lastUsageDate = new Date(lastUsage.created_at);
      const diffMs = lastUsageDate - registrationDate;
      timeToExhaustDays = diffMs / (1000 * 60 * 60 * 24);
      timeToExhaustHours = diffMs / (1000 * 60 * 60);
    }

    results.push({
      userId,
      username: profile.username,
      registeredAt: profile.created_at,
      currentCredits,
      totalCreditsReceived: totalReceived,
      totalCreditsUsed: totalUsed,
      usageCount: usageTransactions.length,
      firstUsageAt: firstUsage?.created_at || null,
      lastUsageAt: lastUsage?.created_at || null,
      timeToExhaustDays: timeToExhaustDays?.toFixed(2) || 'N/A',
      timeToExhaustHours: timeToExhaustHours?.toFixed(2) || 'N/A',
    });
  }

  // Sort by time to exhaust (fastest first)
  results.sort((a, b) => {
    if (a.timeToExhaustDays === 'N/A') return 1;
    if (b.timeToExhaustDays === 'N/A') return -1;
    return parseFloat(a.timeToExhaustDays) - parseFloat(b.timeToExhaustDays);
  });

  // Print results
  console.log('='.repeat(100));
  console.log('FREE USERS WHO EXHAUSTED THEIR CREDITS (< 300 remaining)');
  console.log('='.repeat(100));
  console.log();

  for (const r of results) {
    console.log(`Username: ${r.username}`);
    console.log(`  User ID: ${r.userId}`);
    console.log(`  Registered: ${r.registeredAt}`);
    console.log(`  Current Credits: ${r.currentCredits}`);
    console.log(`  Total Received: ${r.totalCreditsReceived}`);
    console.log(`  Total Used: ${r.totalCreditsUsed}`);
    console.log(`  Usage Count: ${r.usageCount} generations`);
    console.log(`  First Usage: ${r.firstUsageAt || 'Never'}`);
    console.log(`  Last Usage: ${r.lastUsageAt || 'Never'}`);
    console.log(`  Time to Exhaust: ${r.timeToExhaustDays} days (${r.timeToExhaustHours} hours)`);
    console.log('-'.repeat(100));
  }

  // Summary statistics
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(100));

  const validResults = results.filter((r) => r.timeToExhaustDays !== 'N/A');

  if (validResults.length > 0) {
    const days = validResults.map((r) => parseFloat(r.timeToExhaustDays));
    const avgDays = days.reduce((a, b) => a + b, 0) / days.length;
    const minDays = Math.min(...days);
    const maxDays = Math.max(...days);
    const medianDays = days.sort((a, b) => a - b)[Math.floor(days.length / 2)];

    const totalUsageCount = results.reduce((sum, r) => sum + r.usageCount, 0);
    const avgUsageCount = totalUsageCount / results.length;

    console.log(`\nTotal free users analyzed: ${results.length}`);
    console.log(`Users with usage data: ${validResults.length}`);
    console.log(`\nTime to exhaust free credits:`);
    console.log(`  Average: ${avgDays.toFixed(2)} days`);
    console.log(`  Median: ${medianDays.toFixed(2)} days`);
    console.log(`  Fastest: ${minDays.toFixed(2)} days`);
    console.log(`  Slowest: ${maxDays.toFixed(2)} days`);
    console.log(`\nUsage statistics:`);
    console.log(`  Total generations: ${totalUsageCount}`);
    console.log(`  Average generations per user: ${avgUsageCount.toFixed(1)}`);
  } else {
    console.log('\nNo users with usage data to analyze.');
  }

  // Export as JSON for further analysis
  const outputPath = './free-users-analysis.json';
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results exported to: ${outputPath}`);
}

main().catch(console.error);
