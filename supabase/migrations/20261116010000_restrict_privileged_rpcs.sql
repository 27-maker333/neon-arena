-- Restrict privileged functions to the backend service only.
revoke all on function public.on_user_created() from public, anon, authenticated;
revoke all on function public.get_leaderboard(text,integer) from public, anon, authenticated;
grant execute on function public.get_leaderboard(text,integer) to service_role;
create index if not exists inventory_item_idx on public.inventory(item_id);
