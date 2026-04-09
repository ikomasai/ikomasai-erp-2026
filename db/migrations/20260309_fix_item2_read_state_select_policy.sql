-- item2: 既読表示向け read state 参照ポリシー補強
-- 目的:
-- 1. 通報者が自分の呼び出しに紐づく既読状態を参照できるようにする
-- 2. 既存の staff/admin 参照要件は維持する

ALTER TABLE public.item2_chat_read_states ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.item2_chat_read_states TO authenticated;

DROP POLICY IF EXISTS item2_chat_read_states_select_policy ON public.item2_chat_read_states;
CREATE POLICY item2_chat_read_states_select_policy
ON public.item2_chat_read_states
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_item2_staff()
  OR EXISTS (
    SELECT 1
    FROM public.item2_chat_rooms rooms
    INNER JOIN public.item2_calls calls
      ON calls.id = rooms.call_id
    WHERE rooms.id = public.item2_chat_read_states.room_id
      AND calls.requester_user_id = auth.uid()
  )
);
