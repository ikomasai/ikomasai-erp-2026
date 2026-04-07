-- 巡回タスク独立モデル + 鍵返却施錠確認フロー
-- 目的:
-- 1) patrol_tasks / patrol_task_results / key_loans を追加
-- 2) 開始/終了報告 -> 巡回タスク自動生成RPC
-- 3) 鍵返却 -> lock_checkタスク生成RPC

-- =========================================================
-- 1. テーブル
-- =========================================================

CREATE TABLE IF NOT EXISTS public.key_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code TEXT NOT NULL,
  key_label TEXT NOT NULL,
  event_name TEXT,
  event_location TEXT,
  borrower_name TEXT,
  borrower_contact TEXT,
  status TEXT NOT NULL DEFAULT 'loaned' CHECK (status IN ('loaned', 'returned')),
  loaned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  return_processed_by UUID REFERENCES auth.users(id),
  lock_task_requested BOOLEAN NOT NULL DEFAULT FALSE,
  lock_task_id UUID,
  lock_check_status TEXT CHECK (lock_check_status IN ('locked', 'unlocked', 'cannot_confirm')),
  lock_checked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patrol_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_no TEXT UNIQUE,
  task_type TEXT NOT NULL CHECK (
    task_type IN (
      'confirm_start',
      'confirm_end',
      'lock_check',
      'emergency_support',
      'routine_patrol',
      'other'
    )
  ),
  task_status TEXT NOT NULL DEFAULT 'open' CHECK (
    task_status IN ('open', 'accepted', 'en_route', 'done', 'canceled')
  ),
  location_text TEXT,
  event_name TEXT,
  event_location TEXT,
  notes TEXT,
  source_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  source_key_loan_id UUID REFERENCES public.key_loans(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patrol_task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.patrol_tasks(id) ON DELETE CASCADE,
  result_code TEXT NOT NULL,
  memo TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'key_loans'
      AND constraint_name = 'key_loans_lock_task_id_fkey'
  ) THEN
    ALTER TABLE public.key_loans
      ADD CONSTRAINT key_loans_lock_task_id_fkey
      FOREIGN KEY (lock_task_id) REFERENCES public.patrol_tasks(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_key_loans_status ON public.key_loans(status);
CREATE INDEX IF NOT EXISTS idx_key_loans_lock_task_id ON public.key_loans(lock_task_id);
CREATE INDEX IF NOT EXISTS idx_key_loans_created_at ON public.key_loans(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patrol_tasks_task_status ON public.patrol_tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_task_type ON public.patrol_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_assigned_to ON public.patrol_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_source_ticket_id ON public.patrol_tasks(source_ticket_id);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_source_key_loan_id ON public.patrol_tasks(source_key_loan_id);
CREATE INDEX IF NOT EXISTS idx_patrol_tasks_created_at ON public.patrol_tasks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patrol_task_results_task_id
  ON public.patrol_task_results(task_id);
CREATE INDEX IF NOT EXISTS idx_patrol_task_results_created_at
  ON public.patrol_task_results(created_at DESC);

-- =========================================================
-- 2. 採番/updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_patrol_task_no()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  generated_no TEXT;
BEGIN
  generated_no := 'P-' ||
    TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' ||
    UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
  RETURN generated_no;
END;
$$;

ALTER TABLE public.patrol_tasks
  ALTER COLUMN task_no SET DEFAULT public.generate_patrol_task_no();

UPDATE public.patrol_tasks
SET task_no = public.generate_patrol_task_no()
WHERE task_no IS NULL OR LENGTH(TRIM(task_no)) = 0;

CREATE OR REPLACE FUNCTION public.set_patrol_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patrol_tasks_updated_at ON public.patrol_tasks;
CREATE TRIGGER trg_patrol_tasks_updated_at
  BEFORE UPDATE ON public.patrol_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_patrol_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.set_key_loans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_key_loans_updated_at ON public.key_loans;
CREATE TRIGGER trg_key_loans_updated_at
  BEFORE UPDATE ON public.key_loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_key_loans_updated_at();

-- =========================================================
-- 3. RLS
-- =========================================================

ALTER TABLE public.key_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrol_task_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_loans'
      AND policyname = 'key_loans_select_authenticated'
  ) THEN
    CREATE POLICY key_loans_select_authenticated
      ON public.key_loans
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_loans'
      AND policyname = 'key_loans_insert_authenticated'
  ) THEN
    CREATE POLICY key_loans_insert_authenticated
      ON public.key_loans
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'key_loans'
      AND policyname = 'key_loans_update_authenticated'
  ) THEN
    CREATE POLICY key_loans_update_authenticated
      ON public.key_loans
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_tasks'
      AND policyname = 'patrol_tasks_select_authenticated'
  ) THEN
    CREATE POLICY patrol_tasks_select_authenticated
      ON public.patrol_tasks
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_tasks'
      AND policyname = 'patrol_tasks_insert_authenticated'
  ) THEN
    CREATE POLICY patrol_tasks_insert_authenticated
      ON public.patrol_tasks
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_tasks'
      AND policyname = 'patrol_tasks_update_authenticated'
  ) THEN
    CREATE POLICY patrol_tasks_update_authenticated
      ON public.patrol_tasks
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_task_results'
      AND policyname = 'patrol_task_results_select_authenticated'
  ) THEN
    CREATE POLICY patrol_task_results_select_authenticated
      ON public.patrol_task_results
      FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patrol_task_results'
      AND policyname = 'patrol_task_results_insert_authenticated'
  ) THEN
    CREATE POLICY patrol_task_results_insert_authenticated
      ON public.patrol_task_results
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- =========================================================
-- 4. RPC
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_create_ticket_and_auto_tasks(ticket_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  payload JSONB := COALESCE(ticket_payload, '{}'::jsonb);
  created_ticket public.support_tickets%ROWTYPE;
  created_task public.patrol_tasks%ROWTYPE;
BEGIN
  INSERT INTO public.support_tickets (
    ticket_no,
    ticket_type,
    ticket_status,
    priority,
    title,
    description,
    event_name,
    event_location,
    event_id,
    org_id,
    created_by,
    assigned_hq_user_id,
    notify_target,
    metadata
  )
  VALUES (
    NULLIF(payload->>'ticket_no', ''),
    COALESCE(NULLIF(payload->>'ticket_type', ''), 'rule_question'),
    COALESCE(NULLIF(payload->>'ticket_status', ''), 'new'),
    COALESCE(NULLIF(payload->>'priority', ''), 'normal'),
    COALESCE(NULLIF(payload->>'title', ''), '無題'),
    COALESCE(payload->>'description', ''),
    COALESCE(payload->>'event_name', ''),
    COALESCE(payload->>'event_location', ''),
    NULLIF(payload->>'event_id', '')::UUID,
    NULLIF(payload->>'org_id', '')::UUID,
    NULLIF(payload->>'created_by', '')::UUID,
    NULLIF(payload->>'assigned_hq_user_id', '')::UUID,
    COALESCE(NULLIF(payload->>'notify_target', ''), 'none'),
    COALESCE(payload->'metadata', '{}'::jsonb)
  )
  RETURNING * INTO created_ticket;

  IF created_ticket.ticket_type IN ('start_report', 'end_report') THEN
    INSERT INTO public.patrol_tasks (
      task_type,
      task_status,
      location_text,
      event_name,
      event_location,
      notes,
      source_ticket_id,
      created_by
    )
    VALUES (
      CASE
        WHEN created_ticket.ticket_type = 'start_report' THEN 'confirm_start'
        ELSE 'confirm_end'
      END,
      'open',
      created_ticket.event_location,
      created_ticket.event_name,
      created_ticket.event_location,
      created_ticket.description,
      created_ticket.id,
      created_ticket.created_by
    )
    RETURNING * INTO created_task;

    UPDATE public.support_tickets
    SET ticket_status = 'waiting_external'
    WHERE id = created_ticket.id
      AND ticket_status IN ('new', 'acknowledged');

    SELECT * INTO created_ticket
    FROM public.support_tickets
    WHERE id = created_ticket.id;
  END IF;

  RETURN jsonb_build_object(
    'ticket', to_jsonb(created_ticket),
    'task',
    CASE
      WHEN created_task.id IS NULL THEN NULL
      ELSE to_jsonb(created_task)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_accept_task(task_id UUID, patrol_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_user_id UUID := COALESCE(patrol_user_id, auth.uid());
  updated_task public.patrol_tasks%ROWTYPE;
BEGIN
  IF normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'patrol_user_id is required';
  END IF;

  UPDATE public.patrol_tasks
  SET
    task_status = CASE
      WHEN task_status = 'open' THEN 'accepted'
      ELSE task_status
    END,
    assigned_to = COALESCE(assigned_to, normalized_user_id),
    accepted_at = COALESCE(accepted_at, NOW()),
    updated_at = NOW()
  WHERE id = task_id
    AND task_status IN ('open', 'accepted', 'en_route')
    AND (assigned_to IS NULL OR assigned_to = normalized_user_id)
  RETURNING * INTO updated_task;

  IF updated_task.id IS NULL THEN
    RAISE EXCEPTION 'task not found or cannot be accepted';
  END IF;

  IF updated_task.source_ticket_id IS NOT NULL THEN
    UPDATE public.support_tickets
    SET ticket_status = 'in_progress'
    WHERE id = updated_task.source_ticket_id
      AND ticket_status IN ('new', 'acknowledged', 'waiting_external');
  END IF;

  RETURN to_jsonb(updated_task);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_complete_task(task_id UUID, result_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  payload JSONB := COALESCE(result_payload, '{}'::jsonb);
  normalized_user_id UUID := COALESCE(NULLIF(payload->>'patrol_user_id', '')::UUID, auth.uid());
  normalized_result_code TEXT := COALESCE(NULLIF(payload->>'result_code', ''), 'OK');
  normalized_memo TEXT := COALESCE(payload->>'memo', '');
  completed_task public.patrol_tasks%ROWTYPE;
  created_result public.patrol_task_results%ROWTYPE;
  thread_body TEXT;
BEGIN
  IF normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'patrol_user_id is required';
  END IF;

  UPDATE public.patrol_tasks
  SET
    task_status = 'done',
    assigned_to = COALESCE(assigned_to, normalized_user_id),
    done_at = COALESCE(done_at, NOW()),
    updated_at = NOW()
  WHERE id = task_id
    AND task_status IN ('open', 'accepted', 'en_route')
    AND (assigned_to IS NULL OR assigned_to = normalized_user_id)
  RETURNING * INTO completed_task;

  IF completed_task.id IS NULL THEN
    RAISE EXCEPTION 'task not found or cannot be completed';
  END IF;

  INSERT INTO public.patrol_task_results (
    task_id,
    result_code,
    memo,
    created_by
  )
  VALUES (
    completed_task.id,
    normalized_result_code,
    NULLIF(normalized_memo, ''),
    normalized_user_id
  )
  RETURNING * INTO created_result;

  IF completed_task.source_ticket_id IS NOT NULL THEN
    thread_body := '巡回確認完了: ' || normalized_result_code;
    IF LENGTH(TRIM(normalized_memo)) > 0 THEN
      thread_body := thread_body || E'\n' || normalized_memo;
    END IF;

    UPDATE public.support_tickets
    SET ticket_status = 'resolved'
    WHERE id = completed_task.source_ticket_id
      AND ticket_status <> 'closed';

    INSERT INTO public.ticket_messages (ticket_id, author_id, body)
    VALUES (completed_task.source_ticket_id, normalized_user_id, thread_body);
  END IF;

  IF completed_task.task_type = 'lock_check' AND completed_task.source_key_loan_id IS NOT NULL THEN
    UPDATE public.key_loans
    SET
      lock_check_status = CASE
        WHEN LOWER(normalized_result_code) IN ('locked', 'ok') THEN 'locked'
        WHEN LOWER(normalized_result_code) IN ('unlocked', 'ng') THEN 'unlocked'
        ELSE 'cannot_confirm'
      END,
      lock_checked_at = NOW(),
      updated_at = NOW()
    WHERE id = completed_task.source_key_loan_id;
  END IF;

  RETURN jsonb_build_object(
    'task', to_jsonb(completed_task),
    'result', to_jsonb(created_result)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_return_key_and_create_lock_task(
  loan_id UUID,
  create_lock_task BOOLEAN DEFAULT TRUE,
  optional_assignee UUID DEFAULT NULL,
  return_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_user_id UUID := COALESCE(return_user_id, auth.uid());
  updated_loan public.key_loans%ROWTYPE;
  created_task public.patrol_tasks%ROWTYPE;
BEGIN
  IF normalized_user_id IS NULL THEN
    RAISE EXCEPTION 'return_user_id is required';
  END IF;

  UPDATE public.key_loans
  SET
    status = 'returned',
    returned_at = COALESCE(returned_at, NOW()),
    return_processed_by = normalized_user_id,
    updated_at = NOW()
  WHERE id = loan_id
  RETURNING * INTO updated_loan;

  IF updated_loan.id IS NULL THEN
    RAISE EXCEPTION 'loan not found';
  END IF;

  IF create_lock_task THEN
    INSERT INTO public.patrol_tasks (
      task_type,
      task_status,
      location_text,
      event_name,
      event_location,
      notes,
      source_key_loan_id,
      assigned_to,
      created_by
    )
    VALUES (
      'lock_check',
      'open',
      COALESCE(updated_loan.event_location, updated_loan.key_label),
      updated_loan.event_name,
      updated_loan.event_location,
      '鍵返却後の施錠確認: ' || updated_loan.key_label,
      updated_loan.id,
      optional_assignee,
      normalized_user_id
    )
    RETURNING * INTO created_task;

    UPDATE public.key_loans
    SET
      lock_task_requested = TRUE,
      lock_task_id = created_task.id,
      updated_at = NOW()
    WHERE id = updated_loan.id
    RETURNING * INTO updated_loan;
  END IF;

  RETURN jsonb_build_object(
    'loan', to_jsonb(updated_loan),
    'task',
    CASE
      WHEN created_task.id IS NULL THEN NULL
      ELSE to_jsonb(created_task)
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_ticket_and_auto_tasks(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_accept_task(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_task(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_return_key_and_create_lock_task(UUID, BOOLEAN, UUID, UUID) TO authenticated;

-- =========================================================
-- 5. Realtime / コメント
-- =========================================================

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.key_loans;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patrol_tasks;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patrol_task_results;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END;
$$;

COMMENT ON TABLE public.key_loans IS '鍵の貸出/返却履歴（返却起点で施錠確認タスクを作成）';
COMMENT ON TABLE public.patrol_tasks IS '巡回タスク（開始/終了確認、施錠確認、緊急対応など）';
COMMENT ON TABLE public.patrol_task_results IS '巡回タスクの完了結果';
