CREATE OR REPLACE FUNCTION public.create_notification_with_recipient(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_sender_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_sender_user_id IS NOT NULL AND auth.uid() <> p_sender_user_id THEN
    RAISE EXCEPTION 'Sender mismatch';
  END IF;

  INSERT INTO public.notifications (
    sender_user_id,
    title,
    body,
    metadata
  ) VALUES (
    p_sender_user_id,
    p_title,
    p_body,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_recipients (
    notification_id,
    user_id
  ) VALUES (
    v_notification_id,
    p_user_id
  );

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification_with_recipient(uuid, text, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_with_recipient(uuid, text, text, jsonb, uuid) TO service_role;
