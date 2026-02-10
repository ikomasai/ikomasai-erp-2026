# 初期データ投入手順（roles.permissions 含む）

最終更新日: 2026-02-10

## 1. 目的

フェーズ7〜10で追加した画面/テーブルを利用するために、`roles.permissions`・`user_roles`・`user_organizations` の初期投入手順を定義する。

対象画面:
- `item12`（巡回）
- `item13`（本部）
- `item14`（会計）
- `item15`（物品）
- `item16`（企画者）

## 2. 前提

- 既存3テーブル（`user_profiles` / `user_roles` / `roles`）は削除・リネームしない
- 本手順は Additive（追記）で実施する
- 事前に `docs/database/006_phase7_domain_tables_ddl.sql` と `docs/database/009_phase10_rls.sql` が適用済みであること

## 3. 事前バックアップ（必須）

```sql
create table if not exists public._backup_roles_20260210 as
select *
from public.roles;

create table if not exists public._backup_user_roles_20260210 as
select *
from public.user_roles;
```

## 4. roles.permissions 追記（item12〜item16）

注記:
- 下記の `name` は環境のロール名に合わせて調整する
- 既存の `screens` / `features` は保持しつつ、必要分のみ追加する

```sql
begin;

with role_permissions as (
  select *
  from (
    values
      ('HQ',         '["item13"]'::jsonb, '{"item13":["read","write","assign"]}'::jsonb),
      ('Patrol',     '["item12"]'::jsonb, '{"item12":["accept","complete","check","evaluate"]}'::jsonb),
      ('Accounting', '["item14"]'::jsonb, '{"item14":["read","reply","resolve"]}'::jsonb),
      ('Property',   '["item15"]'::jsonb, '{"item15":["read","reply","resolve"]}'::jsonb),
      ('Exhibitor',  '["item16"]'::jsonb, '{"item16":["create","reply","report","reserve_key"]}'::jsonb)
  ) as t(role_name, screens_json, features_json)
)
update public.roles as r
set
  permissions = jsonb_build_object(
    'screens',
    (
      select to_jsonb(array_agg(distinct screen_name order by screen_name))
      from (
        select jsonb_array_elements_text(coalesce(r.permissions->'screens', '[]'::jsonb)) as screen_name
        union all
        select jsonb_array_elements_text(rp.screens_json) as screen_name
      ) as merged_screens
    ),
    'features',
    coalesce(r.permissions->'features', '{}'::jsonb) || rp.features_json
  ),
  updated_at = now()
from role_permissions as rp
where r.name = rp.role_name;

commit;
```

## 5. 投入結果確認

```sql
select
  name,
  permissions->'screens' as screens,
  permissions->'features' as features
from public.roles
where name in ('HQ', 'Patrol', 'Accounting', 'Property', 'Exhibitor')
order by name;
```

確認ポイント:
- `screens` に各ロールの対象 `item12`〜`item16` が含まれる
- 既存の `item1`〜`item11` が消えていない
- `features` が空になっていない

## 6. user_roles 割り当て

```sql
-- 例: 対象ユーザーへロールを割り当てる（重複は追加しない）
insert into public.user_roles (user_id, role_id)
select
  u.id as user_id,
  r.id as role_id
from auth.users as u
join public.roles as r
  on r.name = 'Patrol'  -- ここを対象ロールへ変更
where u.email = 'patrol@example.com'
and not exists (
  select 1
  from public.user_roles ur
  where ur.user_id = u.id
    and ur.role_id = r.id
);
```

## 7. user_organizations 割り当て

```sql
-- 例: 出展ユーザーを団体へ割り当てる（重複は追加しない）
insert into public.user_organizations (user_id, organization_id, is_primary)
select
  u.id as user_id,
  o.id as organization_id,
  true as is_primary
from auth.users as u
join public.organizations as o
  on o.name = 'Sample Exhibitor'
where u.email = 'exhibitor@example.com'
and not exists (
  select 1
  from public.user_organizations uo
  where uo.user_id = u.id
    and uo.organization_id = o.id
);
```

## 8. スモークチェック

- `permissions.screens` にない画面が Drawer に表示されない
- `item16` ユーザーが他団体 `support_tickets` を参照できない
- `item14` ユーザーは `distribution_change` のみ参照できる
- `item15` ユーザーは `damage_report` のみ参照できる
- `item12` ユーザーは未割当＋自分担当タスクのみ参照できる
