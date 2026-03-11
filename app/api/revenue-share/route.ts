import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Config
    const IRCV = 0.00042;
    const REVENUE_SHARE_PERCENTAGE = 0.5;
    const START_DATE = "2026-01-01T00:00:00Z";
    const END_DATE = "2026-01-31T23:59:59Z";
    
    // Fixed Costs
    const FIXED_COSTS = {
      livekit: 50,
      dedicatedServer: 20,
      vercel: 20,
    };
    const totalFixedCosts = Object.values(FIXED_COSTS).reduce((a, b) => a + b, 0);

    let totalPaidCredits = 0;
    let totalVoiceApiCosts = 0;
    
    // 1. Calculate Revenue from Paid Credits
    // We assume usage_events track the credits spent for calls
    let usagePage = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: usageEvents, error: usageError } = await supabase
        .from('usage_events')
        .select('amount, type, metadata')
        .eq('type', 'call_usage') // Assuming this type for calls
        .gte('created_at', START_DATE)
        .lte('created_at', END_DATE)
        .range(usagePage * pageSize, (usagePage + 1) * pageSize - 1);

      if (usageError) throw usageError;
      if (!usageEvents || usageEvents.length === 0) break;

      for (const event of usageEvents) {
        // Only count if metadata indicates it was a paid credit usage
        // This is a placeholder check based on your requirement "free credits should not generate revenue"
        if (event.metadata?.is_free !== true) {
          totalPaidCredits += event.amount || 0;
        }
      }
      
      if (usageEvents.length < pageSize) break;
      usagePage++;
    }

    // 2. Calculate Voice API Costs from Call Sessions
    let sessionPage = 0;
    while (true) {
      const { data: sessions, error: sessionError } = await supabase
        .from('call_sessions')
        .select('duration_seconds, metadata')
        .gte('created_at', START_DATE)
        .lte('created_at', END_DATE)
        .range(sessionPage * pageSize, (sessionPage + 1) * pageSize - 1);

      if (sessionError) throw sessionError;
      if (!sessions || sessions.length === 0) break;

      for (const session of sessions) {
        const costPerMin = session.metadata?.costPerMin || 0;
        const durationMins = (session.duration_seconds || 0) / 60;
        totalVoiceApiCosts += durationMins * costPerMin;
      }

      if (sessions.length < pageSize) break;
      sessionPage++;
    }

    const grossRevenue = totalPaidCredits * IRCV;
    const totalDirectCosts = totalVoiceApiCosts; // Add other dynamic costs here if tracked
    const netCallProfit = grossRevenue - (totalDirectCosts + totalFixedCosts);
    const collaboratorPayout = netCallProfit > 0 ? netCallProfit * REVENUE_SHARE_PERCENTAGE : 0;

    return NextResponse.json({
      period: { start: START_DATE, end: END_DATE },
      metrics: {
        totalPaidCredits,
        grossRevenue,
        costs: {
          voiceApi: totalVoiceApiCosts,
          fixed: totalFixedCosts,
          total: totalDirectCosts + totalFixedCosts
        },
        netCallProfit,
        collaboratorPayout
      }
    });

  } catch (error: any) {
    console.error('Revenue Share Calculation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
