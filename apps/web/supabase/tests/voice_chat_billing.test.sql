begin;
set local search_path = public, extensions;
select plan(30);

insert into auth.users (id, aud, role, email)
values ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'chat-billing@example.test');

update public.credits set amount = 10000 where user_id = '10101010-1010-4010-8010-101010101010';

prepare start_chat(uuid) as select public.start_voice_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', $1, 'Hello'
);
prepare wallet as select amount from public.credits where user_id = '10101010-1010-4010-8010-101010101010';
prepare finish_chat(uuid, text, jsonb) as select public.save_voice_chat_reply(
  '10101010-1010-4010-8010-101010101010', $1, 'Hello back', $2, $3
);

select ok(not has_table_privilege('authenticated', 'voice_chat_rates', 'INSERT'), 'browser cannot set chat rates');
select ok(not has_table_privilege('service_role', 'voice_chat_rates', 'UPDATE'), 'the app cannot edit a published rate');
select ok(not has_function_privilege('authenticated', 'expire_voice_chat_runs()', 'EXECUTE'), 'browser cannot run reconciliation');

set local role service_role;
select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707071')$$, $$values (true)$$, 'reserve and admit once'
);
select results_eq('execute wallet', array[9078], 'one full reservation is 922 credits');
select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707071')$$, $$values (false)$$, 'duplicate POST reuses run'
);
select results_eq('execute wallet', array[9078], 'duplicate admission does not reserve again');
reset role;

insert into public.voice_chat_rates
select 'test-v2', now() - interval '1 second', model, 16384, 1024,
  100000, cached_credits_per_million, output_credits_per_million,
  input_usd_per_million, cached_usd_per_million, output_usd_per_million
from public.voice_chat_rates where version = 'grok420-chat-v1';

set local role service_role;
select results_eq(
  $$execute finish_chat('70707070-7070-4070-8070-707070707071', 'completed',
    '{"promptTokens":101,"promptCachedTokens":70,"completionTokens":10,"reasoningTokens":2}')$$,
  $$values (true)$$, 'provider usage settles after a new rate takes effect'
);
select results_eq('execute wallet', array[9996], 'round the three components together and release the rest');
select results_eq($$
  select source_type::text, unit::text, quantity, credits_used, dollar_amount, metadata->>'rate_version'
  from public.usage_events where source_id = '70707070-7070-4070-8070-707070707071'
$$, $$values ('text_chat', 'tokens', 111::numeric, 4, 0.000078::numeric, 'grok420-chat-v1')$$,
  'usage has real input/output totals, estimate and frozen rate');
select results_eq(
  $$execute finish_chat('70707070-7070-4070-8070-707070707071', 'completed',
    '{"promptTokens":101,"promptCachedTokens":70,"completionTokens":10}')$$,
  $$values (false)$$, 'settlement retry cannot double-charge'
);
select results_eq('execute wallet', array[9996], 'settlement retry cannot refund twice');

update public.credits set amount = 780 where user_id = '10101010-1010-4010-8010-101010101010';
select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707072')$$, $$values (true)$$, 'allow a smaller hold with only 780 credits'
);
select results_eq($$
  select reserved_credits, rate_version from public.voice_chat_runs where id = '70707070-7070-4070-8070-707070707072'
$$, $$values (780, 'test-v2')$$, 'new work uses the new rate');
select results_eq(
  $$execute finish_chat('70707070-7070-4070-8070-707070707072', 'interrupted',
    '{"promptTokens":100,"promptCachedTokens":0,"completionTokens":20}')$$,
  $$values (true)$$, 'an interrupted reply with measured usage settles'
);
select results_eq('execute wallet', array[768], 'interrupted work uses the actual tokens at the new rate');

select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707073')$$, $$values (true)$$, 'start a reply without a final usage report'
);
select results_eq(
  $$execute finish_chat('70707070-7070-4070-8070-707070707073', 'interrupted', null)$$,
  $$values (true)$$, 'missing usage closes the run'
);
select results_eq('execute wallet', array[768], 'missing usage returns the entire hold');
select is((select count(*) from public.usage_events
  where source_id = '70707070-7070-4070-8070-707070707073'), 0::bigint, 'missing usage cannot be billed');

select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707074')$$, $$values (true)$$, 'start a run that will lose its producer'
);
update public.voice_chat_runs set expires_at = now() - interval '1 second'
  where id = '70707070-7070-4070-8070-707070707074';
update public.voice_conversation_leases set expires_at = now() - interval '1 second'
  where room_name = 'chat:70707070-7070-4070-8070-707070707074';
reset role;
select is(public.expire_voice_chat_runs(), 1, 'reconciliation closes an expired run');
select is(public.expire_voice_chat_runs(), 0, 'reconciliation only closes an expired run once');
select results_eq('execute wallet', array[768], 'reconciliation releases an expired hold');

set local role service_role;
update public.credits set amount = 0 where user_id = '10101010-1010-4010-8010-101010101010';
select throws_ok(
  $$execute start_chat('70707070-7070-4070-8070-707070707075')$$, 'SV402', null, 'zero balance fails before model work'
);
select ok(not exists(select from public.conversation_messages
  where id = 'chat-user:70707070-7070-4070-8070-707070707075'), 'rejected send has no stored user message');

update public.credits set amount = 100 where user_id = '10101010-1010-4010-8010-101010101010';
select results_eq(
  $$execute start_chat('70707070-7070-4070-8070-707070707076')$$, $$values (true)$$, 'start a run before erasure'
);
select is(public.erase_account_conversations('10101010-1010-4010-8010-101010101010'), 1, 'erase the conversation');
select results_eq('execute wallet', array[100], 'erasing an active run releases its hold');
select is((select count(*) from public.usage_events
  where source_id = '70707070-7070-4070-8070-707070707076'), 0::bigint, 'erasure cannot fabricate usage');

select * from finish();
rollback;
