-- フェーズ7: ドメインDB拡張DDL
-- 実行日: 2026-02-09
-- 方針:
-- 1) 既存3テーブル（user_profiles/user_roles/roles）には一切変更を加えない
-- 2) 既存テーブルとの衝突を避けるため、すべて Additive（IF NOT EXISTS）で適用
-- 3) created_by / assigned_to は auth.users を基本参照
-- 4) ticket_no / task_no / loan_no / reservation_no は UNIQUE 制約を付与

BEGIN;

-- =========================================================
-- 0. 共通マスタ
-- =========================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_type text NOT NULL CHECK (org_type IN ('exhibitor', 'department', 'hq', 'other')),
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_type, name)
);

CREATE TABLE IF NOT EXISTS public.user_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_code text UNIQUE,
  name text NOT NULL,
  building text,
  floor text,
  room text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- events は既存テーブルを再利用する（未存在環境向けに最小作成）
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  type text,
  capacity_per_slot integer,
  slot_duration_minutes integer,
  estimated_wait_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'owner' CHECK (relation_type IN ('owner', 'support', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, organization_id, relation_type)
);

-- =========================================================
-- 1. チケット関連
-- =========================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  ticket_type text NOT NULL CHECK (
    ticket_type IN (
      'emergency',
      'rule_question',
      'layout_change',
      'distribution_change',
      'damage_report',
      'key_preapply',
      'start_report',
      'end_report'
    )
  ),
  ticket_status text NOT NULL DEFAULT 'new' CHECK (
    ticket_status IN ('new', 'acknowledged', 'in_progress', 'waiting_external', 'resolved', 'closed')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  title text NOT NULL,
  description text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_hq_user_id uuid REFERENCES auth.users(id),
  notify_target text NOT NULL DEFAULT 'none' CHECK (notify_target IN ('accounting', 'property', 'none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  storage_bucket text NOT NULL DEFAULT 'ticket-attachments',
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, storage_bucket, storage_path)
);

-- =========================================================
-- 2. 鍵関連
-- =========================================================

CREATE TABLE IF NOT EXISTS public.keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'loaned', 'disabled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.key_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_no text NOT NULL UNIQUE,
  key_id uuid NOT NULL REFERENCES public.keys(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  reservation_status text NOT NULL DEFAULT 'pending' CHECK (reservation_status IN ('pending', 'approved', 'rejected', 'canceled')),
  requested_start_at timestamptz NOT NULL,
  requested_end_at timestamptz NOT NULL,
  reason text,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_start_at < requested_end_at)
);

CREATE TABLE IF NOT EXISTS public.key_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_no text NOT NULL UNIQUE,
  key_id uuid NOT NULL REFERENCES public.keys(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  borrower_user_id uuid NOT NULL REFERENCES auth.users(id),
  loaned_by uuid NOT NULL REFERENCES auth.users(id),
  returned_by uuid REFERENCES auth.users(id),
  loaned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  returned_at timestamptz,
  loan_status text NOT NULL DEFAULT 'loaned' CHECK (loan_status IN ('loaned', 'returned', 'overdue', 'lost')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 3. 巡回・評価関連
-- =========================================================

CREATE TABLE IF NOT EXISTS public.patrol_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_no text NOT NULL UNIQUE,
  task_type text NOT NULL CHECK (
    task_type IN ('confirm_start', 'confirm_end', 'lock_check', 'emergency_support', 'routine_patrol', 'other')
  ),
  task_status text NOT NULL DEFAULT 'open' CHECK (
    task_status IN ('open', 'accepted', 'en_route', 'done', 'canceled')
  ),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  source_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  source_key_loan_id uuid REFERENCES public.key_loans(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  notes text,
  accepted_at timestamptz,
  done_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.patrol_task_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.patrol_tasks(id) ON DELETE CASCADE,
  result_code text NOT NULL CHECK (
    result_code IN ('OK', 'NOT_STARTED', 'NOT_ENDED', 'LOCKED', 'UNLOCKED', 'CANNOT_CONFIRM', 'NEED_SUPPORT', 'OTHER')
  ),
  memo text,
  photo_bucket text,
  photo_path text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

CREATE TABLE IF NOT EXISTS public.patrol_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_by uuid NOT NULL REFERENCES auth.users(id),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  check_category text NOT NULL CHECK (
    check_category IN ('health_issue', 'trouble', 'visitor_incident', 'unlocked', 'other')
  ),
  memo text,
  photo_bucket text,
  photo_path text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluation_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.patrol_tasks(id) ON DELETE SET NULL,
  evaluator_id uuid NOT NULL REFERENCES auth.users(id),
  evaluation_status text NOT NULL DEFAULT 'pending' CHECK (
    evaluation_status IN ('pending', 'approved', 'rejected', 'rework')
  ),
  score integer CHECK (score BETWEEN 1 AND 5),
  comment text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 4. 無線（通知は今回スコープ外）
-- =========================================================

CREATE TABLE IF NOT EXISTS public.radio_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_by uuid NOT NULL REFERENCES auth.users(id),
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'C' CHECK (severity IN ('S', 'A', 'B', 'C')),
  channel text,
  message text NOT NULL,
  related_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  related_task_id uuid REFERENCES public.patrol_tasks(id) ON DELETE SET NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- 5. インデックス
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id
  ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id
  ON public.user_organizations(organization_id);

CREATE INDEX IF NOT EXISTS idx_event_organizations_event_id
  ON public.event_organizations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_organizations_organization_id
  ON public.event_organizations(organization_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_status
  ON public.support_tickets(ticket_status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ticket_type
  ON public.support_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
  ON public.support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by
  ON public.support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_hq_user_id
  ON public.support_tickets(assigned_hq_user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id
  ON public.support_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_notify_target
  ON public.support_tickets(notify_target);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON public.support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id_created_at
  ON public.ticket_messages(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id
  ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by
  ON public.ticket_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_keys_status
  ON public.keys(status);
CREATE INDEX IF NOT EXISTS idx_keys_location_id
  ON public.keys(location_id);

CREATE INDEX IF NOT EXISTS idx_key_reservations_key_id_status
  ON public.key_reservations(key_id, reservation_status);
CREATE INDEX IF NOT EXISTS idx_key_reservations_org_id_status
  ON public.key_reservations(org_id, reservation_status);
CREATE INDEX IF NOT EXISTS idx_key_reservations_requested_start_at
  ON public.key_reservations(requested_start_at);

CREATE INDEX IF NOT EXISTS idx_key_loans_key_id_status
  ON public.key_loans(key_id, loan_status);
CREATE INDEX IF NOT EXISTS idx_key_loans_borrower_user_id_status
  ON public.key_loans(borrower_user_id, loan_status);
CREATE INDEX IF NOT EXISTS idx_key_loans_returned_at
  ON public.key_loans(returned_at);

CREATE INDEX IF NOT EXISTS idx_patrol_tasks_task_status
  ON public.patrol_tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_assigned_to_task_status
  ON public.patrol_tasks(assigned_to, task_status);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_source_ticket_id
  ON public.patrol_tasks(source_ticket_id);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_source_key_loan_id
  ON public.patrol_tasks(source_key_loan_id);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_created_at
  ON public.patrol_tasks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patrol_task_results_created_by
  ON public.patrol_task_results(created_by);
CREATE INDEX IF NOT EXISTS idx_patrol_task_results_created_at
  ON public.patrol_task_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patrol_checks_checked_by_checked_at
  ON public.patrol_checks(checked_by, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_patrol_checks_location_id_checked_at
  ON public.patrol_checks(location_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_evaluation_checks_event_id
  ON public.evaluation_checks(event_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_checks_evaluation_status
  ON public.evaluation_checks(evaluation_status);
CREATE INDEX IF NOT EXISTS idx_evaluation_checks_evaluator_id
  ON public.evaluation_checks(evaluator_id);

CREATE INDEX IF NOT EXISTS idx_radio_logs_severity_logged_at
  ON public.radio_logs(severity, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_radio_logs_related_ticket_id
  ON public.radio_logs(related_ticket_id);
CREATE INDEX IF NOT EXISTS idx_radio_logs_related_task_id
  ON public.radio_logs(related_task_id);
CREATE INDEX IF NOT EXISTS idx_radio_logs_logged_by_logged_at
  ON public.radio_logs(logged_by, logged_at DESC);

COMMIT;
