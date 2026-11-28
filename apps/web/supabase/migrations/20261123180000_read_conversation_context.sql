set search_path = '';

-- This model-facing projection is shared by text and voice. The UI reads the
-- message rows directly for paging and resumable delivery.
create function public.read_conversation_context(p_user_id uuid, p_conversation_id uuid)
returns table (id text, role text, content text, interrupted boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select m.id, m.position, m.role, m.parts, m.status
    from public.conversation_messages m
    join public.conversations c on c.id = m.conversation_id
    where c.id = p_conversation_id and c.user_id = p_user_id
      and m.status in ('completed', 'interrupted')
    order by m.position desc
    limit 32
  ),
  visible as (
    select recent.*, (
      select pg_catalog.string_agg(part->>'content', E'\n' order by ordinal)
      from pg_catalog.jsonb_array_elements(parts) with ordinality as items(part, ordinal)
    ) as content
    from recent
  ),
  sized as (
    select visible.*,
      row_number() over newest_first as recency,
      sum(pg_catalog.char_length(content)) over newest_first as running_length
    from visible
    where content ~ '[^[:space:]]'
    window newest_first as (order by position desc)
  )
  select id, role, pg_catalog.right(content, 12000), status = 'interrupted'
  from sized
  where recency = 1 or running_length <= 12000
  order by position;
$$;

revoke all on function public.read_conversation_context(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_conversation_context(uuid, uuid) to service_role;
