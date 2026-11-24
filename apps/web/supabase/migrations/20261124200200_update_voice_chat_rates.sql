set search_path = '';

insert into public.voice_chat_rates (
  version, effective_at, model, input_token_limit, output_token_limit,
  input_credits_per_million, cached_credits_per_million, output_credits_per_million,
  input_usd_per_million, cached_usd_per_million, output_usd_per_million
) values (
  'grok420-chat-v2', pg_catalog.clock_timestamp(), 'grok-4.20-0309-non-reasoning',
  16384, 1024, 75000, 12000, 150000, 1.25, 0.20, 2.50
);
