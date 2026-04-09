<!-- 正本: docs/AI共通ルール.md | 最終同期: 2026-02-25 -->

# Supabase スキーマ参照

プロジェクト: `qlldsvpkcfftbibujltf`（ap-south-1、Postgres 17）
テーブル数: 49（public スキーマ）

---

## 1. 認証・ユーザー管理（6 テーブル）

### roles (RLS: ON)
団体名や部署、組織をまとめるテーブル
- カラム: id, name, display_name, description, permissions(jsonb), created_at, updated_at
- 対応: `src/services/supabase/permissionService.js`

### user_profiles (RLS: OFF)
ユーザーの基本情報（テーマ設定、パスワード変更履歴）
- カラム: id, user_id, name, organization, theme_mode, password_changed_at, created_at, updated_at
- 対応: `src/services/supabase/userService.js`

### user_roles (RLS: OFF)
ユーザーとロールの紐付け
- カラム: id, user_id, role_id, created_at
- 対応: `src/services/supabase/permissionService.js`

### organizations (RLS: ON)
組織マスタ
- カラム: id, org_type, name, code, created_at, updated_at

### user_organizations (RLS: ON)
ユーザーと組織の紐付け
- カラム: id, user_id, organization_id, is_primary, created_at

### departments (RLS: OFF)
部署マスタ
- カラム: id, name, created_at, updated_at

---

## 2. イベント・屋台・会場（12 テーブル）

### events (RLS: ON)
企画テーブル
- カラム: id, name, description, image_path, category_id, location_id, event_organization_id, is_published, created_at, updated_at
- 対応: `src/features/item1/services/`

### event_dates (RLS: ON)
企画開催日
- カラム: id, event_id, date, status, next_ticket_number, start_time, end_time, created_at, updated_at

### event_organizations (RLS: ON)
企画運営団体
- カラム: id, name, created_at, updated_at

### event_categorys (RLS: ON)
企画カテゴリマスタ
- カラム: id, name, display_order, created_at, updated_at

### event_locations (RLS: ON)
企画場所マスタ
- カラム: id, name, display_order, building_id, created_at, updated_at

### stalls (RLS: ON)
屋台情報
- カラム: id, stall_organization_id, location_id, name, description, image_path, category_id, is_published, created_at, updated_at
- 対応: `src/features/item2/services/`

### stall_organizations (RLS: ON)
屋台運営団体
- カラム: id, name, created_at, updated_at

### stall_categorys (RLS: ON)
屋台カテゴリマスタ
- カラム: id, name, display_order, created_at, updated_at

### stall_locations (RLS: ON)
屋台場所マスタ
- カラム: id, display_order, created_at, updated_at, area_id, building_id, area_letter, stall_number, name

### locations (RLS: ON)
場所マスタ（共通）
- カラム: id, location_code, name, building, floor, room, notes, is_active, latitude, longitude, created_at, updated_at

### area_locations (RLS: ON)
エリアマスタ（場所グループ）
- カラム: id, name, created_at, updated_at

### time_slots (RLS: ON)
時間枠（時間枠定員制用）
- カラム: id, event_id, event_date_id, start_time, end_time, status, current_count, start_ticket_number, created_at, updated_at

---

## 3. チケット・受付（3 テーブル）

### tickets (RLS: ON)
整理券
- カラム: id, event_id, event_date_id, time_slot_id, ticket_number, medium_type, qr_token, issued_at, created_at
- 対応: `src/features/item3/services/`

### ticket_logs (RLS: ON)
発券ログ
- カラム: id, ticket_id, action, performed_at, details

### call_status (RLS: ON)
呼び出し状態（順次案内制用）
- カラム: id, event_id, event_date_id, current_call_number, updated_at

---

## 4. 警備・安全（9 テーブル）

### visitor_counts (RLS: ON)
来場者カウント（渉外部システム連携）
- カラム: id, count, counted_at, operation, updated_by, created_at
- 対応: `src/features/item4/services/`

### suspicious_persons (RLS: ON)
不審者情報（Google Drive 連携で写真保存）
- カラム: id, discovered_at, location, description, urgency_level, status, photo_url, latitude, longitude, reported_by, resolved_at, created_at, updated_at

### emergency_logs (RLS: ON)
緊急モード発動・解除履歴（自然災害のみ）
- カラム: id, action, activated_by, emergency_type, reason, created_at

### disaster_status (RLS: ON)
災害状態管理（外部 API から災害情報を登録、アプリが自動検知）
- カラム: id, is_active, disaster_type, message, activated_at, activated_by, deactivated_by, deactivated_at, created_at, updated_at

### security_members (RLS: ON)
警備員マスタ（詳細仕様未定）
- カラム: id, name, radio_channel, email, created_at, updated_at

### security_placements (RLS: ON)
警備員配置（詳細仕様未定）
- カラム: id, security_member_id, area, status, latitude, longitude, start_time, end_time, created_at, updated_at

### patrol_tasks (RLS: ON)
巡回タスク（開始/終了確認、施錠確認、緊急対応等）
- カラム: id, task_no, task_type, task_status, location_text, event_name, event_location, notes, source_ticket_id, source_key_loan_id, assigned_to, created_by, accepted_at, done_at, created_at, updated_at

### patrol_task_results (RLS: ON)
巡回タスク完了結果
- カラム: id, task_id, result_code, memo, created_by, created_at

### patrol_checks (RLS: ON)
定常巡回ログ
- カラム: id, patrol_user_id, location_id, location_text, check_items, memo, checked_at, created_at

---

## 5. 通知（3 テーブル）

### notifications (RLS: OFF)
通知本文
- カラム: id, sender_user_id, title, body, metadata, created_at
- 対応: `src/shared/services/notificationService.js`

### notification_recipients (RLS: OFF)
通知受信者
- カラム: id, notification_id, user_id, read_at, created_at

### push_subscriptions (RLS: OFF)
Web Push 購読情報
- カラム: id, user_id, endpoint, p256dh, auth, created_at, updated_at
- 対応: `src/shared/services/webPushService.js`

---

## 6. サポート（4 テーブル）

### support_tickets (RLS: ON)
企画者サポート向け連絡案件
- カラム: id, ticket_no, ticket_type, ticket_status, priority, title, description, location_id, event_id, org_id, created_by, assigned_hq_user_id, notify_target, event_name, event_location, metadata, created_at, updated_at
- 対応: `src/features/item5/services/`

### ticket_messages (RLS: ON)
連絡案件の返信スレッド
- カラム: id, ticket_id, author_id, body, is_internal, created_at

### ticket_attachments (RLS: ON)
連絡案件の添付ファイル
- カラム: id, ticket_id, uploaded_by, storage_bucket, storage_path, mime_type, file_size_bytes, caption, created_at

### evaluation_checks (RLS: ON)
評価チェック
- カラム: id, event_id, ticket_id, task_id, evaluator_id, evaluation_status, score, comment, reviewed_by, reviewed_at, created_at, updated_at

---

## 7. 鍵管理（3 テーブル）

### keys (RLS: ON)
鍵マスタ
- カラム: id, key_code, display_name, location_id, location_text, is_active, metadata, created_at, updated_at
- 対応: `src/features/item7/services/`

### key_loans (RLS: ON)
鍵の貸出/返却履歴（返却起点で施錠確認タスク作成）
- カラム: id, key_code, key_label, event_name, event_location, borrower_name, borrower_contact, status, loaned_at, returned_at, return_processed_by, lock_task_requested, lock_task_id, lock_check_status, lock_checked_at, metadata, created_at, updated_at

### key_reservations (RLS: ON)
鍵予約（事前申請）
- カラム: id, reservation_no, key_id, key_code, requested_by, org_id, ticket_id, event_name, event_location, requested_at_text, reason, status, decision_note, approved_by, approved_at, metadata, created_at, updated_at

---

## 8. 臨時ヘルプ（2 テーブル）

### rinji_help_recruits (RLS: ON)
臨時ヘルプ募集
- カラム: id, department_id, head_user_id, headcount, work_date, work_time, location, meet_time, meet_place, description, reward, belongings, status, created_at, updated_at
- 対応: `src/features/item9/services/`

### rinji_help_applications (RLS: ON)
臨時ヘルプ応募
- カラム: id, recruit_id, applicant_user_id, status, created_at, updated_at

---

## 9. 常設内（8 テーブル）

### josenai_profiles (RLS: ON)
常設内ユーザープロファイル
- カラム: id, user_id, sandbox_count_today, sandbox_count_date, created_at, updated_at
- 対応: `src/features/item10/services/`

### josenai_organizations (RLS: ON)
常設内組織マスタ
- カラム: id, organization_code, organization_name, category, is_active, created_at, updated_at

### josenai_projects (RLS: ON)
常設内企画マスタ
- カラム: id, project_code, project_name, organization_id, is_active, created_at, updated_at

### josenai_submissions (RLS: ON)
常設内提出物
- カラム: id, user_id, organization_id, project_id, submission_type, media_type, file_name, file_size_bytes, drive_file_id, drive_file_url, ai_risk_score, ai_risk_details, status, user_comment, reviewer_comment, reviewed_at, reviewed_by, version, created_at, updated_at

### josenai_media_specs (RLS: ON)
常設内メディア仕様
- カラム: id, media_type, display_name, allowed_extensions, max_file_size_mb, is_active, created_at

### josenai_check_items (RLS: ON)
常設内チェック項目
- カラム: id, category, item_code, item_name, description, risk_weight, is_active, display_order, created_at, updated_at

### josenai_rule_documents (RLS: ON)
常設内ルールドキュメント
- カラム: id, document_type, title, content, version, is_active, created_at, updated_at

### josenai_app_settings (RLS: ON)
常設内アプリ設定
- カラム: key, value, description, updated_at

---

## 10. シフト・その他（2 テーブル）

### shift_change_requests (RLS: ON)
シフト変更申請（祭実長・部長→事務部）
- カラム: id, requester_user_id, organization_name, shift_date, source_member_name, source_time_slot, source_area_name, destination_member_name, destination_time_slot, destination_area_name, status, notification_id, completed_by, completed_at, requester_note, responder_note, created_at, updated_at
- 対応: `src/features/jimu-shift/services/`

### radio_logs (RLS: ON)
無線ログ
- カラム: id, logged_by, role, channel, message, location_text, related_ticket_id, related_task_id, metadata, created_at

---

## Edge Functions 一覧（12 個）

| slug | 目的 | 認証 |
|------|------|------|
| `digital_tickets` | デジタルチケット処理 | verify_jwt: false（独自検証） |
| `push-subscription` | Web Push 購読管理 | Bearer + supabase.auth.getUser |
| `dispatch-notification` | プッシュ通知配信 | Bearer / x-internal-notify-token |
| `verify-admin-password` | 管理者パスワード検証 | verify_jwt: false（独自検証） |
| `update-password` | パスワード更新 | verify_jwt: false（独自検証） |
| `import-organizations` | 団体データ一括取込 | verify_jwt: false（独自検証） |
| `import-projects` | 企画データ一括取込 | verify_jwt: false（独自検証） |
| `delete-submission` | 常設内提出物削除 | verify_jwt: false（独自検証） |
| `review` | 常設内レビュー | verify_jwt: false（独自検証） |
| `submit` | 常設内提出 | verify_jwt: false（独自検証） |
| `sandbox` | 常設内サンドボックス | verify_jwt: false（独自検証） |
| `test-drive` | テストドライブ | verify_jwt: false（独自検証） |

---

## RLS OFF テーブル一覧

以下のテーブルは RLS が無効。変更時は注意:
- `user_profiles`
- `user_roles`
- `notifications`
- `notification_recipients`
- `push_subscriptions`
- `departments`

### ERP_setting (RLS: ON)
ERP 共有設定
- 繧ｫ繝ｩ繝: key, value, description, updated_by, created_at, updated_at
