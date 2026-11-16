-- NEON ARENA: guest-friendly multiplayer rooms; service role is sole writer.
create table if not exists public.arena_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  title text not null check (char_length(title) between 3 and 40),
  is_private boolean not null default true,
  max_players smallint not null default 8 check (max_players between 2 and 8),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 hours'
);
create index if not exists arena_rooms_expires_idx on public.arena_rooms(expires_at);
alter table public.arena_rooms enable row level security;
-- Anonymous browsers access rooms solely through the dedicated Edge Function.
revoke all on public.arena_rooms from anon, authenticated;
insert into public.arena_rooms(code,title,is_private,max_players,expires_at)
values ('PUB222','ISLA PÚBLICA',false,8,now()+interval '10 years')
on conflict (code) do update set expires_at=excluded.expires_at;
create table if not exists public.arena_room_quota(
  fingerprint text primary key,
  bucket timestamptz not null default date_trunc('hour',now()),
  attempts smallint not null default 0
);
alter table public.arena_room_quota enable row level security;
revoke all on public.arena_room_quota from anon, authenticated;
create or replace function public.arena_consume_room_quota(p_fingerprint text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_attempts integer;
begin
  if char_length(p_fingerprint)<>64 then return false; end if;
  insert into public.arena_room_quota(fingerprint,bucket,attempts)
  values (p_fingerprint,date_trunc('hour',now()),1)
  on conflict(fingerprint) do update
    set bucket=case when public.arena_room_quota.bucket<date_trunc('hour',now())
                    then date_trunc('hour',now()) else public.arena_room_quota.bucket end,
        attempts=case when public.arena_room_quota.bucket<date_trunc('hour',now())
                      then 1 else public.arena_room_quota.attempts+1 end
  returning attempts into v_attempts;
  return v_attempts<=6;
end; $$;
revoke all on function public.arena_consume_room_quota(text) from public,anon,authenticated;
grant execute on function public.arena_consume_room_quota(text) to service_role;
