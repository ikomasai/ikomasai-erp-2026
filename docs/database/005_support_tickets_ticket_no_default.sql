-- support_tickets.ticket_no のデフォルト採番を追加
-- 既存環境で ticket_no が NOT NULL の場合でも insert できるようにする

CREATE OR REPLACE FUNCTION public.generate_support_ticket_no()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  generated_no TEXT;
BEGIN
  generated_no := 'T-' ||
    TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' ||
    UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

  RETURN generated_no;
END;
$$;

ALTER TABLE public.support_tickets
  ALTER COLUMN ticket_no SET DEFAULT public.generate_support_ticket_no();

UPDATE public.support_tickets
SET ticket_no = public.generate_support_ticket_no()
WHERE ticket_no IS NULL OR LENGTH(TRIM(ticket_no)) = 0;

