begin;
select plan(10);

-- Fixtures are rolled back, including the deferred Auth-user reference.
alter table public.profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into public.profiles (id, username)
values ('44444444-4444-4444-8444-444444444444', 'pgtap-gemini@example.com');

insert into public.usage_events
  (user_id, source_type, unit, quantity, credits_used, model, event_kind,
   input_tokens, output_tokens, total_tokens, dollar_amount, input_chars)
values
  ('44444444-4444-4444-8444-444444444444', 'api_tts', 'operation', 1, 0,
   'gemini-3.1-flash-tts-preview', 'provider_attempt', 0, 100, 100, 0.002, 100),
  ('44444444-4444-4444-8444-444444444444', 'api_tts', 'chars', 10, 20,
   'gemini-3.1-flash-tts-preview', 'customer_usage', null, null, null, null, 10),
  ('44444444-4444-4444-8444-444444444444', 'api_tts', 'operation', 1, 0,
   'gemini-2.5-pro-preview-tts', 'provider_attempt', 0, 50, 50, 0.001, 100);

select is((select sum(input_tokens)::bigint from public.usage_events where user_id = '44444444-4444-4444-8444-444444444444'), 0::bigint, 'zero tokens are preserved');
select is((select total_credits from public.get_usage_summary('44444444-4444-4444-8444-444444444444')), 20::bigint, 'provider telemetry consumes no customer credits');
select is((select operation_count from public.get_usage_summary('44444444-4444-4444-8444-444444444444')), 1::bigint, 'summary counts customer operations once');
select is((select requests from public.api_usage_daily where user_id = '44444444-4444-4444-8444-444444444444' and model = 'gemini-3.1-flash-tts-preview'), 1::bigint, 'API view counts customer requests once');
select is((select sum(total_dollar_amount) from public.api_usage_daily where user_id = '44444444-4444-4444-8444-444444444444'), 0.003::numeric, 'API view includes costs across both models once');
select is((select sum(total_input_chars)::bigint from public.api_usage_daily where user_id = '44444444-4444-4444-8444-444444444444'), 10::bigint, 'provider input characters do not double customer totals');
select is((select input_tokens from public.usage_events where user_id = '44444444-4444-4444-8444-444444444444' and event_kind = 'customer_usage'), null::bigint, 'missing token counts remain NULL');
select throws_ok($$insert into public.usage_events (user_id, source_type, unit, quantity, credits_used, event_kind) values ('44444444-4444-4444-8444-444444444444', 'tts', 'operation', 1, 1, 'provider_attempt')$$, '23514', null, 'provider attempts cannot consume credits');
select throws_ok($$insert into public.usage_events (user_id, source_type, unit, quantity, credits_used, input_tokens) values ('44444444-4444-4444-8444-444444444444', 'tts', 'operation', 1, 0, -1)$$, '23514', null, 'negative token counts are rejected');

select is((select requests from public.api_usage_daily where user_id = '44444444-4444-4444-8444-444444444444' and model = 'gemini-2.5-pro-preview-tts'), 0::bigint, 'provider-only model remains available for internal cost reporting');

select * from finish();
rollback;
