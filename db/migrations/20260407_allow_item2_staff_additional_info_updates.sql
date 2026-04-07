-- item2: 厚生部側からも追加情報を更新できるようにする
-- 目的:
-- 1. 呼び出し者本人だけでなく厚生部も詳細入力を更新できるようにする
-- 2. 既存の can_communicate_by_text を明示的に消さず、未入力時は保持する

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
    can_communicate_by_text = COALESCE(p_can_communicate_by_text, can_communicate_by_text),
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
    AND (requester_user_id = auth.uid() OR public.is_item2_staff())
  RETURNING * INTO v_call;

  IF v_call.id IS NULL THEN
    RAISE EXCEPTION 'item2 call not found or update is not allowed';
  END IF;

  RETURN to_jsonb(v_call);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb, text, timestamptz) TO service_role;
