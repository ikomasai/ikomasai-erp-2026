-- フェーズ10: 新規テーブルRLS拡張（通知はスコープ外）
-- 実行日: 2026-02-10
-- 前提:
-- 1) docs/database/006_phase7_domain_tables_ddl.sql が適用済み
-- 2) 既存3テーブル（user_profiles / user_roles / roles）のRLSは変更しない
-- 3) ロール判定は roles.permissions.screens（item12〜item16）を利用

BEGIN;

-- =========================================================
-- 0. ロール判定ヘルパー
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_has_screen_access(screen_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    INNER JOIN public.roles AS r
      ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND COALESCE(r.permissions->'screens', '[]'::jsonb) ? screen_name
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_user_belongs_to_org(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_organizations AS uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = target_org_id
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_is_hq()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_has_screen_access('item13');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_patrol()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_has_screen_access('item12');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_accounting()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_has_screen_access('item14');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_property()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_has_screen_access('item15');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_exhibitor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.fn_has_screen_access('item16');
$$;

-- =========================================================
-- 1. RLS有効化（新規テーブルのみ）
-- =========================================================

ALTER TABLE IF EXISTS public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.key_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.key_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patrol_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patrol_task_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patrol_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.evaluation_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.radio_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2. organizations / user_organizations / events / locations
-- =========================================================

DROP POLICY IF EXISTS rls_select_organizations ON public.organizations;
CREATE POLICY rls_select_organizations
ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND EXISTS (
      SELECT 1
      FROM public.user_organizations AS uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = organizations.id
    )
  )
);

DROP POLICY IF EXISTS rls_mutate_organizations_hq ON public.organizations;
CREATE POLICY rls_mutate_organizations_hq
ON public.organizations
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_select_user_organizations ON public.user_organizations;
CREATE POLICY rls_select_user_organizations
ON public.user_organizations
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS rls_mutate_user_organizations_hq ON public.user_organizations;
CREATE POLICY rls_mutate_user_organizations_hq
ON public.user_organizations
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_select_events ON public.events;
CREATE POLICY rls_select_events
ON public.events
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND EXISTS (
      SELECT 1
      FROM public.event_organizations AS eo
      INNER JOIN public.user_organizations AS uo
        ON uo.organization_id = eo.organization_id
      WHERE eo.event_id = events.id
        AND uo.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS rls_mutate_events_hq ON public.events;
CREATE POLICY rls_mutate_events_hq
ON public.events
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_select_event_organizations ON public.event_organizations;
CREATE POLICY rls_select_event_organizations
ON public.event_organizations
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND public.fn_user_belongs_to_org(organization_id)
  )
);

DROP POLICY IF EXISTS rls_mutate_event_organizations_hq ON public.event_organizations;
CREATE POLICY rls_mutate_event_organizations_hq
ON public.event_organizations
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_select_locations ON public.locations;
CREATE POLICY rls_select_locations
ON public.locations
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR public.fn_is_patrol()
  OR public.fn_is_exhibitor()
);

DROP POLICY IF EXISTS rls_mutate_locations_hq ON public.locations;
CREATE POLICY rls_mutate_locations_hq
ON public.locations
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

-- =========================================================
-- 3. support_tickets / ticket_messages / ticket_attachments
-- =========================================================

DROP POLICY IF EXISTS rls_select_support_tickets ON public.support_tickets;
CREATE POLICY rls_select_support_tickets
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
  OR (public.fn_is_accounting() AND notify_target = 'accounting')
  OR (public.fn_is_property() AND notify_target = 'property')
  OR (
    public.fn_is_patrol()
    AND EXISTS (
      SELECT 1
      FROM public.patrol_tasks AS pt
      WHERE pt.source_ticket_id = support_tickets.id
        AND (pt.assigned_to IS NULL OR pt.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS rls_insert_support_tickets ON public.support_tickets;
CREATE POLICY rls_insert_support_tickets
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND created_by = auth.uid()
    AND public.fn_user_belongs_to_org(org_id)
  )
);

DROP POLICY IF EXISTS rls_update_support_tickets ON public.support_tickets;
CREATE POLICY rls_update_support_tickets
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
  OR (public.fn_is_accounting() AND notify_target = 'accounting')
  OR (public.fn_is_property() AND notify_target = 'property')
)
WITH CHECK (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
  OR (public.fn_is_accounting() AND notify_target = 'accounting')
  OR (public.fn_is_property() AND notify_target = 'property')
);

DROP POLICY IF EXISTS rls_select_ticket_messages ON public.ticket_messages;
CREATE POLICY rls_select_ticket_messages
ON public.ticket_messages
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_messages.ticket_id
        AND public.fn_user_belongs_to_org(st.org_id)
    )
  )
  OR (
    public.fn_is_accounting()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_messages.ticket_id
        AND st.notify_target = 'accounting'
    )
  )
  OR (
    public.fn_is_property()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_messages.ticket_id
        AND st.notify_target = 'property'
    )
  )
);

DROP POLICY IF EXISTS rls_insert_ticket_messages ON public.ticket_messages;
CREATE POLICY rls_insert_ticket_messages
ON public.ticket_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.fn_is_hq()
    OR (
      public.fn_is_exhibitor()
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets AS st
        WHERE st.id = ticket_messages.ticket_id
          AND public.fn_user_belongs_to_org(st.org_id)
      )
    )
    OR (
      public.fn_is_accounting()
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets AS st
        WHERE st.id = ticket_messages.ticket_id
          AND st.notify_target = 'accounting'
      )
    )
    OR (
      public.fn_is_property()
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets AS st
        WHERE st.id = ticket_messages.ticket_id
          AND st.notify_target = 'property'
      )
    )
  )
);

DROP POLICY IF EXISTS rls_select_ticket_attachments ON public.ticket_attachments;
CREATE POLICY rls_select_ticket_attachments
ON public.ticket_attachments
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_attachments.ticket_id
        AND public.fn_user_belongs_to_org(st.org_id)
    )
  )
  OR (
    public.fn_is_accounting()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_attachments.ticket_id
        AND st.notify_target = 'accounting'
    )
  )
  OR (
    public.fn_is_property()
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS st
      WHERE st.id = ticket_attachments.ticket_id
        AND st.notify_target = 'property'
    )
  )
);

DROP POLICY IF EXISTS rls_insert_ticket_attachments ON public.ticket_attachments;
CREATE POLICY rls_insert_ticket_attachments
ON public.ticket_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    public.fn_is_hq()
    OR (
      public.fn_is_exhibitor()
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets AS st
        WHERE st.id = ticket_attachments.ticket_id
          AND public.fn_user_belongs_to_org(st.org_id)
      )
    )
  )
);

-- =========================================================
-- 4. keys / reservations / loans
-- =========================================================

DROP POLICY IF EXISTS rls_select_keys ON public.keys;
CREATE POLICY rls_select_keys
ON public.keys
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR public.fn_is_exhibitor()
  OR public.fn_is_patrol()
);

DROP POLICY IF EXISTS rls_mutate_keys_hq ON public.keys;
CREATE POLICY rls_mutate_keys_hq
ON public.keys
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_select_key_reservations ON public.key_reservations;
CREATE POLICY rls_select_key_reservations
ON public.key_reservations
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
);

DROP POLICY IF EXISTS rls_insert_key_reservations ON public.key_reservations;
CREATE POLICY rls_insert_key_reservations
ON public.key_reservations
FOR INSERT
TO authenticated
WITH CHECK (
  public.fn_is_hq()
  OR (
    public.fn_is_exhibitor()
    AND requested_by = auth.uid()
    AND public.fn_user_belongs_to_org(org_id)
  )
);

DROP POLICY IF EXISTS rls_update_key_reservations ON public.key_reservations;
CREATE POLICY rls_update_key_reservations
ON public.key_reservations
FOR UPDATE
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
)
WITH CHECK (
  public.fn_is_hq()
  OR (public.fn_is_exhibitor() AND public.fn_user_belongs_to_org(org_id))
);

DROP POLICY IF EXISTS rls_select_key_loans_hq ON public.key_loans;
CREATE POLICY rls_select_key_loans_hq
ON public.key_loans
FOR SELECT
TO authenticated
USING (public.fn_is_hq());

DROP POLICY IF EXISTS rls_mutate_key_loans_hq ON public.key_loans;
CREATE POLICY rls_mutate_key_loans_hq
ON public.key_loans
FOR ALL
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

-- =========================================================
-- 5. patrol / evaluation
-- =========================================================

DROP POLICY IF EXISTS rls_select_patrol_tasks ON public.patrol_tasks;
CREATE POLICY rls_select_patrol_tasks
ON public.patrol_tasks
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_patrol()
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS rls_insert_patrol_tasks_hq ON public.patrol_tasks;
CREATE POLICY rls_insert_patrol_tasks_hq
ON public.patrol_tasks
FOR INSERT
TO authenticated
WITH CHECK (public.fn_is_hq());

DROP POLICY IF EXISTS rls_update_patrol_tasks ON public.patrol_tasks;
CREATE POLICY rls_update_patrol_tasks
ON public.patrol_tasks
FOR UPDATE
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_patrol()
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
)
WITH CHECK (
  public.fn_is_hq()
  OR (
    public.fn_is_patrol()
    AND (assigned_to IS NULL OR assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS rls_select_patrol_task_results ON public.patrol_task_results;
CREATE POLICY rls_select_patrol_task_results
ON public.patrol_task_results
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (
    public.fn_is_patrol()
    AND EXISTS (
      SELECT 1
      FROM public.patrol_tasks AS pt
      WHERE pt.id = patrol_task_results.task_id
        AND (pt.assigned_to IS NULL OR pt.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS rls_insert_patrol_task_results ON public.patrol_task_results;
CREATE POLICY rls_insert_patrol_task_results
ON public.patrol_task_results
FOR INSERT
TO authenticated
WITH CHECK (
  public.fn_is_hq()
  OR (
    public.fn_is_patrol()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.patrol_tasks AS pt
      WHERE pt.id = patrol_task_results.task_id
        AND (pt.assigned_to IS NULL OR pt.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS rls_select_patrol_checks ON public.patrol_checks;
CREATE POLICY rls_select_patrol_checks
ON public.patrol_checks
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_patrol() AND checked_by = auth.uid())
);

DROP POLICY IF EXISTS rls_insert_patrol_checks ON public.patrol_checks;
CREATE POLICY rls_insert_patrol_checks
ON public.patrol_checks
FOR INSERT
TO authenticated
WITH CHECK (
  checked_by = auth.uid()
  AND (public.fn_is_hq() OR public.fn_is_patrol())
);

DROP POLICY IF EXISTS rls_select_evaluation_checks ON public.evaluation_checks;
CREATE POLICY rls_select_evaluation_checks
ON public.evaluation_checks
FOR SELECT
TO authenticated
USING (
  public.fn_is_hq()
  OR (public.fn_is_patrol() AND evaluator_id = auth.uid())
);

DROP POLICY IF EXISTS rls_insert_evaluation_checks ON public.evaluation_checks;
CREATE POLICY rls_insert_evaluation_checks
ON public.evaluation_checks
FOR INSERT
TO authenticated
WITH CHECK (
  (public.fn_is_patrol() AND evaluator_id = auth.uid())
  OR public.fn_is_hq()
);

DROP POLICY IF EXISTS rls_update_evaluation_checks_hq ON public.evaluation_checks;
CREATE POLICY rls_update_evaluation_checks_hq
ON public.evaluation_checks
FOR UPDATE
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

-- =========================================================
-- 6. radio_logs
-- =========================================================

DROP POLICY IF EXISTS rls_select_radio_logs_hq ON public.radio_logs;
CREATE POLICY rls_select_radio_logs_hq
ON public.radio_logs
FOR SELECT
TO authenticated
USING (public.fn_is_hq());

DROP POLICY IF EXISTS rls_insert_radio_logs ON public.radio_logs;
CREATE POLICY rls_insert_radio_logs
ON public.radio_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.fn_is_hq()
  OR (public.fn_is_patrol() AND logged_by = auth.uid())
);

DROP POLICY IF EXISTS rls_update_radio_logs_hq ON public.radio_logs;
CREATE POLICY rls_update_radio_logs_hq
ON public.radio_logs
FOR UPDATE
TO authenticated
USING (public.fn_is_hq())
WITH CHECK (public.fn_is_hq());

COMMIT;
