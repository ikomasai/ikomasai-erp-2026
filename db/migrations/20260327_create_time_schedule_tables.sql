-- TimeSchedule 用テーブルを追加する。
-- event_dates は別機能で利用されているため流用せず、専用テーブルを新設する。

create table if not exists public.time_schedule_areas (
  area_code text primary key,
  area_name text not null,
  display_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.time_schedule_areas is
  'TimeSchedule 表示対象エリアのマスタ';

comment on column public.time_schedule_areas.area_code is
  'エリアコード（例: JITSUGAKU_HALL）';

comment on column public.time_schedule_areas.area_name is
  '画面表示名（例: 実学ホール）';

create table if not exists public.event_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  schedule_date date not null,
  start_time time not null,
  end_time time not null,
  area_code text not null references public.time_schedule_areas(area_code) on update cascade,
  is_visible_time_schedule boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_schedule_slots_source_type_check
    check (source_type in ('event', 'stall')),
  constraint event_schedule_slots_time_range_check
    check (start_time < end_time)
);

alter table public.events
  add column if not exists schedule_dates date[] not null default '{}'::date[];

alter table public.events
  add column if not exists schedule_start_times time[] not null default '{}'::time[];

alter table public.events
  add column if not exists schedule_end_times time[] not null default '{}'::time[];

comment on column public.events.schedule_dates is
  'event_schedule_slots から同期される開催日配列（表示用キャッシュ）';

comment on column public.events.schedule_start_times is
  'event_schedule_slots から同期される開始時刻配列（表示用キャッシュ）';

comment on column public.events.schedule_end_times is
  'event_schedule_slots から同期される終了時刻配列（表示用キャッシュ）';

comment on table public.event_schedule_slots is
  'TimeSchedule 日別開催スロット。複数日・日別時間差をレコード分割で管理する';

comment on column public.event_schedule_slots.source_type is
  '参照元種別: event / stall';

comment on column public.event_schedule_slots.source_id is
  '参照元ID（型差異吸収のため文字列で保持）';

comment on column public.event_schedule_slots.schedule_date is
  '開催日';

comment on column public.event_schedule_slots.is_visible_time_schedule is
  'TimeSchedule 画面に表示するか';

create unique index if not exists uq_event_schedule_slots_slot
  on public.event_schedule_slots (source_type, source_id, schedule_date, start_time, end_time, area_code);

create index if not exists idx_event_schedule_slots_schedule_date
  on public.event_schedule_slots (schedule_date);

create index if not exists idx_event_schedule_slots_area_code
  on public.event_schedule_slots (area_code);

create index if not exists idx_event_schedule_slots_visible_date
  on public.event_schedule_slots (is_visible_time_schedule, schedule_date);

create index if not exists idx_event_schedule_slots_source
  on public.event_schedule_slots (source_type, source_id);

create unique index if not exists uq_time_schedule_areas_display_order
  on public.time_schedule_areas (display_order);

create or replace function public.set_time_schedule_areas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_time_schedule_areas_updated_at on public.time_schedule_areas;
create trigger trg_time_schedule_areas_updated_at
  before update on public.time_schedule_areas
  for each row
  execute function public.set_time_schedule_areas_updated_at();

create or replace function public.set_event_schedule_slots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.resolve_time_schedule_area_code(p_area_name text)
returns text
language plpgsql
immutable
as $$
begin
  case coalesce(trim(p_area_name), '')
    when '実学ホール' then return 'JITSUGAKU_HALL';
    when '11月ホール' then return 'NOVEMBER_HALL';
    when '記念会館' then return 'KINEN_KAIKAN';
    when '人工芝グラウンド' then return 'ARTIFICIAL_TURF';
    else return 'OTHER';
  end case;
end;
$$;

create or replace function public.validate_event_schedule_slot_source()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean;
begin
  if new.source_type = 'event' then
    select exists (
      select 1
      from public.events e
      where e.id::text = new.source_id
    ) into v_exists;

    if not v_exists then
      raise exception 'events に source_id=% が存在しません', new.source_id;
    end if;
  elsif new.source_type = 'stall' then
    select exists (
      select 1
      from public.stalls s
      where s.id::text = new.source_id
    ) into v_exists;

    if not v_exists then
      raise exception 'stalls に source_id=% が存在しません', new.source_id;
    end if;
  else
    raise exception 'source_type は event か stall のみ許可されます: %', new.source_type;
  end if;

  return new;
end;
$$;

create or replace function public.refresh_event_schedule_cache(p_event_id text)
returns void
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  begin
    v_event_id := p_event_id::uuid;
  exception
    when others then
      return;
  end;

  update public.events e
  set
    schedule_dates = coalesce(cache.schedule_dates, '{}'::date[]),
    schedule_start_times = coalesce(cache.schedule_start_times, '{}'::time[]),
    schedule_end_times = coalesce(cache.schedule_end_times, '{}'::time[]),
    updated_at = now()
  from (
    select
      array_agg(s.schedule_date order by s.schedule_date, s.start_time, s.end_time) as schedule_dates,
      array_agg(s.start_time order by s.schedule_date, s.start_time, s.end_time) as schedule_start_times,
      array_agg(s.end_time order by s.schedule_date, s.start_time, s.end_time) as schedule_end_times
    from public.event_schedule_slots s
    where s.source_type = 'event'
      and s.source_id = p_event_id
      and s.is_visible_time_schedule = true
  ) as cache
  where e.id = v_event_id;
end;
$$;

create or replace function public.sync_event_schedule_cache_from_slots()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.source_type = 'event' then
      perform public.refresh_event_schedule_cache(new.source_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.source_type = 'event' then
      perform public.refresh_event_schedule_cache(old.source_id);
    end if;
    if new.source_type = 'event' then
      perform public.refresh_event_schedule_cache(new.source_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.source_type = 'event' then
      perform public.refresh_event_schedule_cache(old.source_id);
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_event_schedule_slots_updated_at on public.event_schedule_slots;
create trigger trg_event_schedule_slots_updated_at
  before update on public.event_schedule_slots
  for each row
  execute function public.set_event_schedule_slots_updated_at();

drop trigger if exists trg_validate_event_schedule_slot_source on public.event_schedule_slots;
create trigger trg_validate_event_schedule_slot_source
  before insert or update on public.event_schedule_slots
  for each row
  execute function public.validate_event_schedule_slot_source();

drop trigger if exists trg_sync_event_schedule_cache_from_slots on public.event_schedule_slots;
create trigger trg_sync_event_schedule_cache_from_slots
  after insert or update or delete on public.event_schedule_slots
  for each row
  execute function public.sync_event_schedule_cache_from_slots();

-- events 既存カラム（start_time/end_time, start_times/end_times）を
-- event_schedule_slots へ移行したうえで削除する。
-- 既存 event_dates.date がある場合はその日付へ展開する。
do $$
declare
  has_start_time boolean;
  has_end_time boolean;
  has_start_times boolean;
  has_end_times boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'start_time'
  ) into has_start_time;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'end_time'
  ) into has_end_time;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'start_times'
  ) into has_start_times;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'end_times'
  ) into has_end_times;

  if has_start_time and has_end_time then
    insert into public.event_schedule_slots (
      source_type,
      source_id,
      schedule_date,
      start_time,
      end_time,
      area_code,
      is_visible_time_schedule
    )
    select
      'event',
      e.id::text,
      d.schedule_date,
      e.start_time,
      e.end_time,
      public.resolve_time_schedule_area_code(al.name),
      true
    from public.events e
    join lateral (
      select ed.date as schedule_date
      from public.event_dates ed
      where ed.event_id = e.id
      union all
      select current_date
      where not exists (
        select 1
        from public.event_dates ed2
        where ed2.event_id = e.id
      )
    ) d on true
    left join public.event_locations el on el.id = e.location_id
    left join public.building_locations bl on bl.id = el.building_id
    left join public.area_locations al on al.id = bl.area_id
    where e.start_time is not null
      and e.end_time is not null
      and e.start_time < e.end_time
    on conflict (source_type, source_id, schedule_date, start_time, end_time, area_code)
    do nothing;
  end if;

  if has_start_times and has_end_times then
    execute $sql$
      insert into public.event_schedule_slots (
        source_type,
        source_id,
        schedule_date,
        start_time,
        end_time,
        area_code,
        is_visible_time_schedule
      )
      select
        'event',
        e.id::text,
        coalesce(ed.date, current_date + ((pairs.idx - 1) || ' day')::interval)::date,
        pairs.start_time,
        pairs.end_time,
        public.resolve_time_schedule_area_code(al.name),
        true
      from public.events e
      join lateral (
        select
          s.idx,
          s.start_time,
          t.end_time
        from unnest(e.start_times::time[]) with ordinality as s(start_time, idx)
        join unnest(e.end_times::time[]) with ordinality as t(end_time, idx)
          on t.idx = s.idx
        where s.start_time < t.end_time
      ) pairs on true
      left join lateral (
        select
          ed.date,
          row_number() over (order by ed.date) as idx
        from public.event_dates ed
        where ed.event_id = e.id
      ) ed on ed.idx = pairs.idx
      left join public.event_locations el on el.id = e.location_id
      left join public.building_locations bl on bl.id = el.building_id
      left join public.area_locations al on al.id = bl.area_id
      on conflict (source_type, source_id, schedule_date, start_time, end_time, area_code)
      do nothing
    $sql$;
  end if;

  if has_start_time then
    alter table public.events drop column start_time;
  end if;

  if has_end_time then
    alter table public.events drop column end_time;
  end if;

  if has_start_times then
    alter table public.events drop column start_times;
  end if;

  if has_end_times then
    alter table public.events drop column end_times;
  end if;

  perform public.refresh_event_schedule_cache(e.id::text)
  from public.events e;
end;
$$;

alter table public.time_schedule_areas enable row level security;
alter table public.event_schedule_slots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'time_schedule_areas'
      and policyname = 'time_schedule_areas_select_authenticated'
  ) then
    create policy time_schedule_areas_select_authenticated
      on public.time_schedule_areas
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'time_schedule_areas'
      and policyname = 'time_schedule_areas_insert_authenticated'
  ) then
    create policy time_schedule_areas_insert_authenticated
      on public.time_schedule_areas
      for insert
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'time_schedule_areas'
      and policyname = 'time_schedule_areas_update_authenticated'
  ) then
    create policy time_schedule_areas_update_authenticated
      on public.time_schedule_areas
      for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_schedule_slots'
      and policyname = 'event_schedule_slots_select_authenticated'
  ) then
    create policy event_schedule_slots_select_authenticated
      on public.event_schedule_slots
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_schedule_slots'
      and policyname = 'event_schedule_slots_insert_authenticated'
  ) then
    create policy event_schedule_slots_insert_authenticated
      on public.event_schedule_slots
      for insert
      with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_schedule_slots'
      and policyname = 'event_schedule_slots_update_authenticated'
  ) then
    create policy event_schedule_slots_update_authenticated
      on public.event_schedule_slots
      for update
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end;
$$;

insert into public.time_schedule_areas (area_code, area_name, display_order, is_active)
values
  ('JITSUGAKU_HALL', '実学ホール', 1, true),
  ('NOVEMBER_HALL', '11月ホール', 2, true),
  ('KINEN_KAIKAN', '記念会館', 3, true),
  ('ARTIFICIAL_TURF', '人工芝グラウンド', 4, true),
  ('OTHER', 'その他', 5, true)
on conflict (area_code) do update
set
  area_name = excluded.area_name,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();
