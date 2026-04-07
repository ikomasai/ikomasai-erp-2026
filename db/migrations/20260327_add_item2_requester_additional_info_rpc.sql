-- item2: 呼び出し作成後に通報者が追加情報を追記できるようにする
-- 目的:
-- 1. 呼び出し直後は最小項目だけで登録できるようにする
-- 2. 通報者本人だけが追加情報を更新できる安全な導線を用意する

CREATE OR REPLACE FUNCTION public.update_item2_call_additional_info(
  p_call_id uuid,
  p_purpose text DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_requester_relation text DEFAULT NULL,
  p_can_communicate_by_text boolean DEFAULT NULL,
  p_assessment_answers jsonb DEFAULT '{}'::jsonb
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

GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item2_call_additional_info(uuid, text, text, text, boolean, jsonb) TO service_role;
