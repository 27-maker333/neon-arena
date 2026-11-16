-- NEON ARENA: PostgreSQL + RLS + transacciones (Supabase)
create extension if not exists pgcrypto;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text,
 avatar_url text,
 level int not null default 1 check (level > 0),
 created_at timestamptz not null default now(),
 constraint username_format check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$')
);
create unique index profiles_username_ci on public.profiles(lower(username)) where username is not null;

create table public.wallets (
 player_id uuid primary key references public.profiles(id) on delete cascade,
 coins int not null default 0 check (coins >= 0)
);
create table public.games (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 title text not null,
 description text not null default '',
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.matches (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.profiles(id) on delete cascade,
 game_id uuid not null references public.games(id),
 seed bigint not null check(seed between 1 and 4294967295),
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '90 seconds'),
 finished_at timestamptz,
 status text not null default 'active' check(status in ('active','completed','expired')),
 score int not null default 0 check(score>=0),
 move_count int not null default 0 check(move_count between 0 and 120)
);
create index matches_rank_idx on public.matches(game_id,score desc) where status='completed';
create index matches_player_idx on public.matches(player_id,started_at desc);

create table public.wallet_transactions (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.profiles(id) on delete cascade,
 match_id uuid unique references public.matches(id),
 kind text not null check(kind in ('match_reward','daily_reward','purchase')),
 amount int not null check(amount <> 0),
 created_at timestamptz not null default now()
);
create index wallet_transactions_player_idx on public.wallet_transactions(player_id,created_at desc);
create table public.daily_rewards (
 player_id uuid not null references public.profiles(id) on delete cascade,
 reward_day date not null,
 coins int not null check(coins>0),
 claimed_at timestamptz not null default now(),
 primary key(player_id,reward_day)
);
create table public.shop_items (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 title text not null,
 description text not null default '',
 price_coins int not null check(price_coins>=0),
 enabled boolean not null default true
);
create table public.inventory (
 player_id uuid not null references public.profiles(id) on delete cascade,
 item_id uuid not null references public.shop_items(id),
 purchased_at timestamptz not null default now(),
 primary key(player_id,item_id)
);

create or replace function public.on_user_created() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id) values (new.id);
 insert into public.wallets(player_id) values (new.id);
 return new;
end; $$;
drop trigger if exists neon_user_created on auth.users;
create trigger neon_user_created after insert on auth.users
for each row execute function public.on_user_created();

insert into public.games(slug,title,description)
values ('neon-blast','Neon Blast','Combina grupos de esferas y consigue la mejor puntuación')
on conflict(slug) do nothing;
insert into public.shop_items(slug,title,description,price_coins) values
 ('violet-trail','Rastro violeta','Efecto cosmético',150),
 ('cosmic-frame','Marco cósmico','Marco de perfil',250)
on conflict(slug) do nothing;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.games enable row level security;
alter table public.matches enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.daily_rewards enable row level security;
alter table public.shop_items enable row level security;
alter table public.inventory enable row level security;

create policy profiles_owner_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy wallets_owner_read on public.wallets for select to authenticated using(player_id=(select auth.uid()));
create policy matches_owner_read on public.matches for select to authenticated using(player_id=(select auth.uid()));
create policy wallet_transactions_owner_read on public.wallet_transactions for select to authenticated using(player_id=(select auth.uid()));
create policy daily_rewards_owner_read on public.daily_rewards for select to authenticated using(player_id=(select auth.uid()));
create policy inventory_owner_read on public.inventory for select to authenticated using(player_id=(select auth.uid()));
create policy games_public_read on public.games for select to anon,authenticated using(enabled);
create policy shop_public_read on public.shop_items for select to anon,authenticated using(enabled);

create or replace function public.get_leaderboard(p_slug text default 'neon-blast',p_limit int default 20)
returns table(rank bigint,player_name text,best_score int,games_played bigint)
language sql stable security definer set search_path='' as $$
 with best as (
  select m.player_id,max(m.score)::int best_score,count(*)::bigint games_played
  from public.matches m join public.games g on g.id=m.game_id
  where g.slug=p_slug and g.enabled and m.status='completed'
  group by m.player_id order by max(m.score) desc limit least(greatest(p_limit,1),100)
 )
 select row_number() over(order by b.best_score desc,b.player_id)::bigint,
  coalesce(p.username,'Jugador-'||left(b.player_id::text,6)),b.best_score,b.games_played
 from best b join public.profiles p on p.id=b.player_id
 order by b.best_score desc,b.player_id;
$$;
revoke all on function public.get_leaderboard(text,int) from public;
grant execute on function public.get_leaderboard(text,int) to anon,authenticated,service_role;

create or replace function public.finalize_neon_match(p_player uuid,p_match uuid,p_score int,p_moves int)
returns int language plpgsql security definer set search_path='' as $$
declare v_reward int;
begin
 if p_score<0 or p_moves<0 or p_moves>120 then raise exception 'invalid_result'; end if;
 update public.matches set status='completed',score=p_score,move_count=p_moves,finished_at=now()
 where id=p_match and player_id=p_player and status='active' and expires_at>now();
 if not found then raise exception 'match_unavailable'; end if;
 v_reward:=least(100,p_score/10);
 update public.wallets set coins=coins+v_reward where player_id=p_player;
 if v_reward>0 then
  insert into public.wallet_transactions(player_id,match_id,kind,amount)
  values(p_player,p_match,'match_reward',v_reward);
 end if;
 return v_reward;
end; $$;
revoke all on function public.finalize_neon_match(uuid,uuid,int,int) from public,anon,authenticated;
grant execute on function public.finalize_neon_match(uuid,uuid,int,int) to service_role;

create or replace function public.claim_neon_daily(p_player uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_day date:=(now() at time zone 'UTC')::date; v_reward int:=50;
begin
 insert into public.daily_rewards(player_id,reward_day,coins) values(p_player,v_day,v_reward) on conflict do nothing;
 if not found then return 0; end if;
 update public.wallets set coins=coins+v_reward where player_id=p_player;
 insert into public.wallet_transactions(player_id,kind,amount) values(p_player,'daily_reward',v_reward);
 return v_reward;
end; $$;
revoke all on function public.claim_neon_daily(uuid) from public,anon,authenticated;
grant execute on function public.claim_neon_daily(uuid) to service_role;

create or replace function public.purchase_neon_item(p_player uuid,p_item uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_price int; v_balance int;
begin
 select price_coins into v_price from public.shop_items where id=p_item and enabled;
 if v_price is null then raise exception 'item_unavailable'; end if;
 if exists(select 1 from public.inventory where player_id=p_player and item_id=p_item) then
  raise exception 'already_owned';
 end if;
 update public.wallets set coins=coins-v_price
 where player_id=p_player and coins>=v_price returning coins into v_balance;
 if not found then raise exception 'insufficient_coins'; end if;
 insert into public.inventory(player_id,item_id) values(p_player,p_item);
 if v_price>0 then
  insert into public.wallet_transactions(player_id,kind,amount) values(p_player,'purchase',-v_price);
 end if;
 return v_balance;
end; $$;
revoke all on function public.purchase_neon_item(uuid,uuid) from public,anon,authenticated;
grant execute on function public.purchase_neon_item(uuid,uuid) to service_role;
