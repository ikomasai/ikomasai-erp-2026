-- item2: 呼び出し後の詳細入力完了状態を保持する
-- 目的:
-- 1. 呼び出し直後は詳細入力待ちとして保存する
-- 2. 詳細入力を完了した時点を別カラムで管理する

ALTER TABLE IF EXISTS public.item2_calls
  ADD COLUMN IF NOT EXISTS detail_status text NOT NULL DEFAULT 'pending'
  CHECK (detail_status IN ('pending', 'completed'));

ALTER TABLE IF EXISTS public.item2_calls
  ADD COLUMN IF NOT EXISTS detail_completed_at timestamptz NULL;

UPDATE public.item2_calls
SET
  detail_status = 'completed',
  detail_completed_at = COALESCE(detail_completed_at, created_at)
WHERE detail_status IS DISTINCT FROM 'completed';

CREATE OR REPLACE FUNCTION public.update_item2_call_additional_info(
  p_call_id uuid,
  p_purpose text DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_requester_relation text DEFAULT NULL,
  p_can_communicate_by_text boolean DEFAULT NULL,
  p_assessment_answers jsonb DEFAULT '{}'::jsonb,
  p_detail_status text DEFAULT 'pending',
  p_detail_completed_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call public.item2_calls;
BEGIN
  UPDATE public.item2_calls
  SET
    purpose = p_purpose,
    detail = p_detail,
    requester_relation = p_requester_relation,
    can_communicate_by_text = p_can_communicate_by_text,
    assessment_answers = COALESCE(p_assessment_answers, '{}'::jsonb),
    detail_status = CASE
      WHEN p_detail_status = 'completed' THEN 'completed'
      ELSE 'pending'
    END,
    detail_completed_at = CASE
      WHEN p_detail_status = 'completed' THEN COALESCE(p_detail_completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_call_id
    AND requester_user_id = auth.uid()
  RETURNING * INTO v_call;

  IF v_call.id IS NULL THEN
    RAISE EXCEPTION 'item2 call not found or update is not allowed';
  END IF;

  RETURN to_jsonb(v_call);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb, text, timestamptz) TO service_role;
