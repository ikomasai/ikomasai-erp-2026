-- 募集終了理由に「募集日経過」を追加し、期限切れ募集を自動クローズする RPC を定義する。

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'rinji_help_recruits_close_reason_check'
      and conrelid = 'public.rinji_help_recruits'::regclass
  ) then
    alter table public.rinji_help_recruits
      drop constraint rinji_help_recruits_close_reason_check;
  end if;

  alter table public.rinji_help_recruits
    add constraint rinji_help_recruits_close_reason_check
    check (
      close_reason is null
      or close_reason in ('manual', 'auto_full', 'auto_date_passed')
    );
end
$$;

comment on column public.rinji_help_recruits.close_reason is
  '募集終了理由: manual(手動終了) / auto_full(満員自動終了) / auto_date_passed(募集日経過)';

create or replace function public.close_expired_rinji_recruits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.rinji_help_recruits r
  set status = 'closed',
      close_reason = 'auto_date_passed',
      updated_at = now()
  where r.status = 'open'
    and r.work_date < (now() at time zone 'Asia/Tokyo')::date;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$$;

grant execute on function public.close_expired_rinji_recruits() to authenticated;
grant execute on function public.close_expired_rinji_recruits() to service_role;
