-- 臨時ヘルプ募集の終了理由を保持する列を追加する。
-- manual: 管理者が手動で終了
-- auto_full: 募集人数到達で自動終了

alter table if exists public.rinji_help_recruits
  add column if not exists close_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rinji_help_recruits_close_reason_check'
      and conrelid = 'public.rinji_help_recruits'::regclass
  ) then
    alter table public.rinji_help_recruits
      add constraint rinji_help_recruits_close_reason_check
      check (close_reason is null or close_reason in ('manual', 'auto_full'));
  end if;
end
$$;

comment on column public.rinji_help_recruits.close_reason is
  '募集終了理由: manual(手動終了) / auto_full(満員自動終了)';
