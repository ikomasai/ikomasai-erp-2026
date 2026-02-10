-- フェーズ8: RPC実装（通知はスコープ外）
-- 実行日: 2026-02-09
-- 前提:
-- 1) docs/database/006_phase7_domain_tables_ddl.sql が適用済みであること
-- 2) 本SQLは RPC のみを追加し、通知系（functions/v1/notify, notifications連携）は含めない

BEGIN;

-- =========================================================
-- 0. 番号採番シーケンス
-- =========================================================

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_no_seq
  INCREMENT 1
  START 1
  MINVALUE 1
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.patrol_task_no_seq
  INCREMENT 1
  START 1
  MINVALUE 1
  CACHE 1;

CREATE OR REPLACE FUNCTION public.rpc_next_ticket_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_serial_number bigint;
BEGIN
  v_serial_number := nextval('public.support_ticket_no_seq');
  RETURN format('T-%s-%s', to_char(current_date, 'YYYY'), lpad(v_serial_number::text, 6, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_next_task_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_serial_number bigint;
BEGIN
  v_serial_number := nextval('public.patrol_task_no_seq');
  RETURN format('P-%s-%s', to_char(current_date, 'YYYY'), lpad(v_serial_number::text, 6, '0'));
END;
$$;

-- =========================================================
-- 1. rpc_create_ticket_and_auto_tasks(ticket_payload)
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_create_ticket_and_auto_tasks(ticket_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_ticket_no text;
  v_ticket_type text;
  v_ticket_status text;
  v_priority text;
  v_title text;
  v_description text;
  v_notify_target text;
  v_created_by uuid;
  v_task_type text;
  v_task_id uuid;
  v_task_no text;
  v_created_task_ids uuid[] := ARRAY[]::uuid[];
  v_created_task_nos text[] := ARRAY[]::text[];
BEGIN
  v_ticket_type := lower(coalesce(ticket_payload->>'ticket_type', ''));
  v_ticket_status := lower(coalesce(ticket_payload->>'ticket_status', 'new'));
  v_priority := lower(coalesce(ticket_payload->>'priority', 'normal'));
  v_title := nullif(ticket_payload->>'title', '');
  v_description := nullif(ticket_payload->>'description', '');
  v_created_by := nullif(ticket_payload->>'created_by', '')::uuid;

  IF v_ticket_type = '' THEN
    RAISE EXCEPTION 'ticket_type is required';
  END IF;

  IF v_title IS NULL THEN
    RAISE EXCEPTION 'title is required';
  END IF;

  IF v_description IS NULL THEN
    RAISE EXCEPTION 'description is required';
  END IF;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required';
  END IF;

  IF v_ticket_status NOT IN ('new', 'acknowledged', 'in_progress', 'waiting_external', 'resolved', 'closed') THEN
    v_ticket_status := 'new';
  END IF;

  IF v_priority NOT IN ('high', 'normal', 'low') THEN
    v_priority := 'normal';
  END IF;

  v_notify_target := lower(coalesce(ticket_payload->>'notify_target', ''));
  IF v_notify_target NOT IN ('accounting', 'property', 'none') THEN
    v_notify_target := CASE
      WHEN v_ticket_type = 'distribution_change' THEN 'accounting'
      WHEN v_ticket_type = 'damage_report' THEN 'property'
      ELSE 'none'
    END;
  END IF;

  v_ticket_no := nullif(ticket_payload->>'ticket_no', '');
  IF v_ticket_no IS NULL THEN
    v_ticket_no := public.rpc_next_ticket_no();
  END IF;

  INSERT INTO public.support_tickets (
    ticket_no,
    ticket_type,
    ticket_status,
    priority,
    title,
    description,
    location_id,
    event_id,
    org_id,
    created_by,
    assigned_hq_user_id,
    notify_target,
    created_at,
    updated_at
  )
  VALUES (
    v_ticket_no,
    v_ticket_type,
    v_ticket_status,
    v_priority,
    v_title,
    v_description,
    nullif(ticket_payload->>'location_id', '')::uuid,
    nullif(ticket_payload->>'event_id', '')::uuid,
    nullif(ticket_payload->>'org_id', '')::uuid,
    v_created_by,
    nullif(ticket_payload->>'assigned_hq_user_id', '')::uuid,
    v_notify_target,
    now(),
    now()
  )
  RETURNING id, ticket_no
  INTO v_ticket_id, v_ticket_no;

  v_task_type := CASE
    WHEN v_ticket_type = 'start_report' THEN 'confirm_start'
    WHEN v_ticket_type = 'end_report' THEN 'confirm_end'
    ELSE NULL
  END;

  IF v_task_type IS NOT NULL THEN
    v_task_no := public.rpc_next_task_no();

    INSERT INTO public.patrol_tasks (
      task_no,
      task_type,
      task_status,
      location_id,
      source_ticket_id,
      assigned_to,
      created_by,
      notes,
      due_at,
      created_at,
      updated_at
    )
    VALUES (
      v_task_no,
      v_task_type,
      'open',
      nullif(ticket_payload->>'location_id', '')::uuid,
      v_ticket_id,
      nullif(ticket_payload->>'task_assignee', '')::uuid,
      v_created_by,
      coalesce(nullif(ticket_payload->>'task_note', ''), format('auto generated from ticket_type=%s', v_ticket_type)),
      nullif(ticket_payload->>'task_due_at', '')::timestamptz,
      now(),
      now()
    )
    RETURNING id, task_no
    INTO v_task_id, v_task_no;

    v_created_task_ids := array_append(v_created_task_ids, v_task_id);
    v_created_task_nos := array_append(v_created_task_nos, v_task_no);
  END IF;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket_id,
    'ticket_no', v_ticket_no,
    'ticket_type', v_ticket_type,
    'notify_target', v_notify_target,
    'created_task_ids', to_jsonb(v_created_task_ids),
    'created_task_nos', to_jsonb(v_created_task_nos)
  );
END;
$$;

-- =========================================================
-- 2. rpc_return_key_and_create_lock_task(loan_id, create_lock_task, optional_assignee)
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_return_key_and_create_lock_task(
  loan_id uuid,
  create_lock_task boolean DEFAULT true,
  optional_assignee uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan public.key_loans%ROWTYPE;
  v_key_location_id uuid;
  v_existing_task_id uuid;
  v_existing_task_no text;
  v_task_id uuid;
  v_task_no text;
BEGIN
  IF loan_id IS NULL THEN
    RAISE EXCEPTION 'loan_id is required';
  END IF;

  SELECT kl.*
  INTO v_loan
  FROM public.key_loans AS kl
  WHERE kl.id = loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'key_loan not found: %', loan_id;
  END IF;

  SELECT k.location_id
  INTO v_key_location_id
  FROM public.keys AS k
  WHERE k.id = v_loan.key_id;

  UPDATE public.key_loans
  SET
    loan_status = 'returned',
    returned_at = COALESCE(returned_at, now()),
    returned_by = COALESCE(returned_by, auth.uid()),
    updated_at = now()
  WHERE id = loan_id
  RETURNING *
  INTO v_loan;

  UPDATE public.keys
  SET
    status = CASE WHEN status = 'disabled' THEN status ELSE 'available' END,
    updated_at = now()
  WHERE id = v_loan.key_id;

  IF create_lock_task THEN
    SELECT id, task_no
    INTO v_existing_task_id, v_existing_task_no
    FROM public.patrol_tasks
    WHERE source_key_loan_id = loan_id
      AND task_type = 'lock_check'
      AND task_status IN ('open', 'accepted', 'en_route')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_task_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'loan_id', v_loan.id,
        'loan_no', v_loan.loan_no,
        'returned_at', v_loan.returned_at,
        'lock_task_created', false,
        'lock_task_id', v_existing_task_id,
        'lock_task_no', v_existing_task_no,
        'message', 'existing active lock_check task found'
      );
    END IF;

    v_task_no := public.rpc_next_task_no();

    INSERT INTO public.patrol_tasks (
      task_no,
      task_type,
      task_status,
      location_id,
      source_key_loan_id,
      assigned_to,
      created_by,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      v_task_no,
      'lock_check',
      'open',
      v_key_location_id,
      v_loan.id,
      optional_assignee,
      auth.uid(),
      '鍵返却に伴う施錠確認',
      now(),
      now()
    )
    RETURNING id, task_no
    INTO v_task_id, v_task_no;

    RETURN jsonb_build_object(
      'loan_id', v_loan.id,
      'loan_no', v_loan.loan_no,
      'returned_at', v_loan.returned_at,
      'lock_task_created', true,
      'lock_task_id', v_task_id,
      'lock_task_no', v_task_no
    );
  END IF;

  RETURN jsonb_build_object(
    'loan_id', v_loan.id,
    'loan_no', v_loan.loan_no,
    'returned_at', v_loan.returned_at,
    'lock_task_created', false
  );
END;
$$;

-- =========================================================
-- 3. rpc_accept_task(task_id, patrol_user_id)
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_accept_task(task_id uuid, patrol_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.patrol_tasks%ROWTYPE;
  v_current_status text;
  v_current_assignee uuid;
BEGIN
  IF task_id IS NULL THEN
    RAISE EXCEPTION 'task_id is required';
  END IF;

  IF patrol_user_id IS NULL THEN
    RAISE EXCEPTION 'patrol_user_id is required';
  END IF;

  UPDATE public.patrol_tasks
  SET
    task_status = 'accepted',
    assigned_to = patrol_user_id,
    accepted_at = COALESCE(accepted_at, now()),
    updated_at = now()
  WHERE id = task_id
    AND task_status = 'open'
    AND (assigned_to IS NULL OR assigned_to = patrol_user_id)
  RETURNING *
  INTO v_task;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'task_id', v_task.id,
      'task_no', v_task.task_no,
      'task_status', v_task.task_status,
      'assigned_to', v_task.assigned_to,
      'accepted_at', v_task.accepted_at
    );
  END IF;

  SELECT task_status, assigned_to
  INTO v_current_status, v_current_assignee
  FROM public.patrol_tasks
  WHERE id = task_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'task not found: %', task_id;
  END IF;

  RAISE EXCEPTION 'task cannot be accepted (status=%, assigned_to=%)', v_current_status, v_current_assignee;
END;
$$;

-- =========================================================
-- 4. rpc_complete_task(task_id, result_payload)
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_complete_task(task_id uuid, result_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.patrol_tasks%ROWTYPE;
  v_result_id uuid;
  v_result_code text;
  v_result_memo text;
  v_photo_bucket text;
  v_photo_path text;
  v_result_created_by uuid;
BEGIN
  IF task_id IS NULL THEN
    RAISE EXCEPTION 'task_id is required';
  END IF;

  v_result_code := upper(coalesce(result_payload->>'result_code', ''));
  v_result_memo := nullif(result_payload->>'memo', '');
  v_photo_bucket := nullif(result_payload->>'photo_bucket', '');
  v_photo_path := nullif(result_payload->>'photo_path', '');
  v_result_created_by := nullif(result_payload->>'created_by', '')::uuid;

  IF v_result_code = '' THEN
    RAISE EXCEPTION 'result_payload.result_code is required';
  END IF;

  IF v_result_code NOT IN ('OK', 'NOT_STARTED', 'NOT_ENDED', 'LOCKED', 'UNLOCKED', 'CANNOT_CONFIRM', 'NEED_SUPPORT', 'OTHER') THEN
    RAISE EXCEPTION 'unsupported result_code: %', v_result_code;
  END IF;

  SELECT *
  INTO v_task
  FROM public.patrol_tasks
  WHERE id = task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found: %', task_id;
  END IF;

  IF v_task.task_status NOT IN ('accepted', 'en_route', 'done') THEN
    RAISE EXCEPTION 'task cannot be completed from status=%', v_task.task_status;
  END IF;

  UPDATE public.patrol_tasks
  SET
    task_status = 'done',
    done_at = COALESCE(done_at, now()),
    updated_at = now()
  WHERE id = task_id
  RETURNING *
  INTO v_task;

  IF v_result_created_by IS NULL THEN
    v_result_created_by := COALESCE(v_task.assigned_to, auth.uid());
  END IF;

  INSERT INTO public.patrol_task_results (
    task_id,
    result_code,
    memo,
    photo_bucket,
    photo_path,
    created_by,
    created_at
  )
  VALUES (
    v_task.id,
    v_result_code,
    v_result_memo,
    v_photo_bucket,
    v_photo_path,
    v_result_created_by,
    now()
  )
  ON CONFLICT (task_id) DO UPDATE
  SET
    result_code = EXCLUDED.result_code,
    memo = EXCLUDED.memo,
    photo_bucket = EXCLUDED.photo_bucket,
    photo_path = EXCLUDED.photo_path,
    created_by = EXCLUDED.created_by,
    created_at = now()
  RETURNING id
  INTO v_result_id;

  RETURN jsonb_build_object(
    'task_id', v_task.id,
    'task_no', v_task.task_no,
    'task_status', v_task.task_status,
    'done_at', v_task.done_at,
    'result_id', v_result_id,
    'result_code', v_result_code
  );
END;
$$;

COMMIT;
