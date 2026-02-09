# Supabase テーブル概要

最終更新日: 2026/02/09

---

## 目次

1. [テーブル一覧](#テーブル一覧)
2. [テーブル詳細](#テーブル詳細)
   - [user_profiles](#user_profiles)
   - [user_roles](#user_roles)
   - [roles](#roles)
3. [リレーション図](#リレーション図)
4. [RLS ポリシー一覧](#rls-ポリシー一覧)
5. [コードベースでのデータ取得方法](#コードベースでのデータ取得方法)

---

## テーブル一覧

| テーブル名 | 説明 | RLS |
| --- | --- | --- |
| user_profiles | ユーザーのプロフィール情報（名前、所属、テーマ設定、パスワード変更日時など） | 有効 |
| user_roles | ユーザーと役職の中間テーブル（多対多） | 有効 |
| roles | 役職マスターテーブル（権限情報を含む） | 有効 |

---

## テーブル詳細

### user_profiles

**説明:** ユーザーごとのプロフィール情報を保存するテーブル。`auth.users` と 1:1 の関係。

**カラム構造:**

| カラム名 | 型 | NULL許可 | デフォルト値 | 説明 |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | レコードの主キー（自動生成） |
| user_id | uuid | NO | NULL | ユーザーID（FK → auth.users.id） |
| name | text | NO | NULL | ユーザー名（表示名） |
| organization | text | YES | NULL | 所属団体名 |
| theme_mode | text | NO | 'light' | テーマ設定（`light` / `dark` / `joshi` / `world_trigger` / `eva`） |
| password_changed_at | timestamp with time zone | YES | NULL | パスワード変更日時（null の場合は初回ログインと判定） |
| created_at | timestamp with time zone | NO | now() | レコード作成日時 |
| updated_at | timestamp with time zone | NO | now() | レコード更新日時 |

**使用箇所:**

- `src/services/supabase/userService.js` — プロフィール取得・更新
- `src/shared/services/themeSettingsService.js` — テーマ設定の取得・保存
- `src/features/auth/services/passwordService.js` — パスワード変更日時の更新

---

### user_roles

**説明:** ユーザーと役職の多対多の関係を管理する中間テーブル。1 人のユーザーが複数の役職を持つことができる。

**カラム構造:**

| カラム名 | 型 | NULL許可 | デフォルト値 | 説明 |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | レコードの主キー（自動生成） |
| user_id | uuid | NO | NULL | ユーザーID（FK → auth.users.id） |
| role_id | uuid | NO | NULL | 役職ID（FK → roles.id） |
| created_at | timestamp with time zone | NO | now() | レコード作成日時 |

**使用箇所:**

- `src/services/supabase/userService.js` — ユーザーの役職一覧取得（roles テーブルと JOIN）

---

### roles

**説明:** 役職のマスターテーブル。各役職に紐づく画面アクセス権限や機能権限を JSONB 形式で保持する。

**カラム構造:**

| カラム名 | 型 | NULL許可 | デフォルト値 | 説明 |
| --- | --- | --- | --- | --- |
| id | uuid | NO | gen_random_uuid() | 役職の主キー（自動生成） |
| name | text | NO | NULL | 役職名（例: `事務部`, `物品部`, `会計部`） |
| display_name | text | NO | NULL | 表示用の役職名 |
| description | text | YES | NULL | 役職の説明 |
| permissions | jsonb | YES | NULL | 権限情報（下記参照） |
| created_at | timestamp with time zone | NO | NULL | レコード作成日時 |
| updated_at | timestamp with time zone | NO | NULL | レコード更新日時 |

**permissions の構造:**

```json
{
  "screens": ["item1", "item2", "当日部員"],
  "features": {
    "item1": ["edit", "delete"]
  }
}
```

- `screens` — アクセス可能な画面名の配列
- `features` — 画面ごとに使用可能な機能の配列（キー: 画面名、値: 機能名の配列）

**permissions.screens の値と画面の対応:**

画面へのアクセスは `src/navigation/components/CustomDrawerContent.jsx` の `PERMISSION_NAME_MAP` で定義される。
Supabase の `permissions.screens` に含まれる値と、コード側の `PERMISSION_NAME_MAP` の値が一致するとアクセスが許可される。

| permissions.screens の値 | 対応する画面（SCREEN_NAME_MAP） | サイドバー表示名（ITEM_LABELS） |
| --- | --- | --- |
| `item1` ~ `item10` | `Item1` ~ `Item10`（デフォルト） | `項目1` ~ `項目10`（デフォルト） |
| `当日部員` | `JimuShift` | `当日部員` |

※ `PERMISSION_NAME_MAP` にカスタム定義がない場合、`item{番号}` がデフォルトの権限名として使用される。

**使用箇所:**

- `src/services/supabase/userService.js` — user_roles 経由で JOIN 取得
- `src/services/supabase/permissionService.js` — 権限チェック（`canAccessScreen`, `canUseFeature`, `getAccessibleScreens`, `isAdmin`, `hasRole`）

---

## リレーション図

```
auth.users (Supabase Auth 管理テーブル)
    │
    │  user_profiles.user_id → auth.users.id（1:1）
    │
    ▼
user_profiles
    - id          ← レコード固有のPK
    - user_id     ← auth.users.id と紐づく（UNIQUE）
    - name
    - organization
    - theme_mode
    - password_changed_at
    - created_at
    - updated_at


auth.users (Supabase Auth 管理テーブル)
    │
    │  user_roles.user_id → auth.users.id（1:N）
    │  ※ 1人のユーザーが複数の役職を持てる
    │
    ▼
user_roles（中間テーブル）
    - id          ← レコード固有のPK
    - user_id     ← auth.users.id と紐づく
    - role_id     ← roles.id と紐づく
    - created_at
    │
    │  user_roles.role_id → roles.id（N:1）
    │  ※ 1つの役職に複数のユーザーが属する
    │
    ▼
roles（マスターテーブル）
    - id          ← 役職固有のPK
    - name
    - display_name
    - description
    - permissions  ← JSONB（画面・機能の権限情報）
    - created_at
    - updated_at
```

**つながりのまとめ:**

| 関係 | 接続元 | 接続先 | 種類 | 説明 |
| --- | --- | --- | --- | --- |
| ユーザー → プロフィール | auth.users.id | user_profiles.user_id | 1:1 | 1人のユーザーにつき1つのプロフィール |
| ユーザー → 中間テーブル | auth.users.id | user_roles.user_id | 1:N | 1人のユーザーが複数の役職割り当てを持つ |
| 中間テーブル → 役職 | user_roles.role_id | roles.id | N:1 | 各割り当てレコードが1つの役職を参照する |

**結果として:** auth.users と roles は **多対多（N:N）** の関係になる（user_roles が中間テーブルとして機能）。

---

## RLS ポリシー一覧

### user_profiles

| ポリシー名 | 操作 | 条件 |
| --- | --- | --- |
| Users can view their own profile | SELECT | `auth.uid() = user_id` |
| Users can update their own profile | UPDATE | `auth.uid() = user_id` |
| Users can insert their own profile | INSERT | `auth.uid() = user_id` |

### user_roles

| ポリシー名 | 操作 | 条件 |
| --- | --- | --- |
| Users can view their own roles | SELECT | `auth.uid() = user_id` |

### roles

| ポリシー名 | 操作 | 条件 |
| --- | --- | --- |
| Authenticated users can view roles | SELECT | `true`（認証済みユーザー全員が閲覧可能） |

---

## コードベースでのデータ取得方法

### ユーザープロフィールの取得

**ファイル:** `src/services/supabase/userService.js`
**関数:** `selectUserProfile(userId)`

```javascript
const { data, error } = await getSupabaseClient()
  .from('user_profiles')
  .select('*')
  .eq('user_id', userId)
  .single();
```

**返り値:** `{ profile, error }`

---

### ユーザーの役職一覧の取得

**ファイル:** `src/services/supabase/userService.js`
**関数:** `selectUserRoles(userId)`

```javascript
const { data, error } = await getSupabaseClient()
  .from('user_roles')
  .select(`
    *,
    roles (
      id,
      name,
      display_name,
      description,
      permissions
    )
  `)
  .eq('user_id', userId);
```

**返り値:** `{ roles, error }`

※ `roles` は roles テーブルのオブジェクト配列。取得後に `data.map((item) => item.roles)` で user_roles のネストを解除している。

---

### ユーザー情報の一括取得（プロフィール + 役職）

**ファイル:** `src/services/supabase/userService.js`
**関数:** `selectUserInfo(userId)`

```javascript
const [profileResult, rolesResult] = await Promise.all([
  selectUserProfile(userId),
  selectUserRoles(userId),
]);

const userInfo = {
  ...profileResult.profile,
  roles: rolesResult.roles,
};
```

**返り値:** `{ userInfo, error }`

※ `userInfo` はプロフィール情報に `roles` 配列を追加した統合オブジェクト。アプリ全体で `AuthContext` 経由で参照される。

---

### プロフィールの更新

**ファイル:** `src/services/supabase/userService.js`
**関数:** `updateUserProfile(userId, updates)`

```javascript
const { data, error } = await getSupabaseClient()
  .from('user_profiles')
  .update({
    ...updates,
    updated_at: new Date().toISOString(),
  })
  .eq('user_id', userId)
  .select()
  .single();
```

**返り値:** `{ profile, error }`

---

### テーマ設定の取得

**ファイル:** `src/shared/services/themeSettingsService.js`
**関数:** `themeSettingsService.getThemeSettings(userId)`

```javascript
const { data, error } = await supabase
  .from('user_profiles')
  .select('theme_mode')
  .eq('user_id', userId)
  .single();
```

**返り値:** `theme_mode`（文字列）または `null`

---

### テーマ設定の保存

**ファイル:** `src/shared/services/themeSettingsService.js`
**関数:** `themeSettingsService.saveThemeSettings(userId, themeMode)`

```javascript
const { error } = await supabase
  .from('user_profiles')
  .update({
    theme_mode: themeMode,
    updated_at: new Date().toISOString(),
  })
  .eq('user_id', userId);
```

**返り値:** `true`（成功）または `false`（失敗）

---

### パスワード変更日時の更新

**ファイル:** `src/features/auth/services/passwordService.js`
**関数:** `updatePasswordChangedAt(userId)`

```javascript
const { error } = await getSupabaseClient()
  .from('user_profiles')
  .update({ password_changed_at: new Date().toISOString() })
  .eq('user_id', userId);
```

**返り値:** `{ error }`

---

### 権限チェック（クライアント側）

**ファイル:** `src/services/supabase/permissionService.js`

| 関数名 | 説明 | 引数 |
| --- | --- | --- |
| `canAccessScreen(userRoles, screenName)` | 特定の画面にアクセス可能か | 役職配列, 画面名 |
| `canUseFeature(userRoles, screenName, featureName)` | 特定の機能を使用可能か | 役職配列, 画面名, 機能名 |
| `getAccessibleScreens(userRoles)` | アクセス可能な画面一覧を取得 | 役職配列 |
| `isAdmin(userRoles)` | 管理者かどうか | 役職配列 |
| `hasRole(userRoles, roleName)` | 特定の役職を持っているか | 役職配列, 役職名 |

※ これらの関数は Supabase に直接アクセスせず、取得済みの `userInfo.roles` を使用してクライアント側で判定する。
