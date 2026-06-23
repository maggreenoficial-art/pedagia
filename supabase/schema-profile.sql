-- PedagIA — perfil do professor (coluna leve, separada do builder_state)
-- Supabase → SQL Editor → colar → Run (após schema.sql)

ALTER TABLE public.pedagia_workspace
  ADD COLUMN IF NOT EXISTS teacher_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Patch opcional (evita reenviar builder_state gigante se preferir manter só JSONB interno)
CREATE OR REPLACE FUNCTION public.pedagia_patch_builder_state_key(
  p_user_id UUID,
  p_key     TEXT,
  p_value   JSONB
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.pedagia_workspace (user_id, builder_state, updated_at)
  VALUES (
    p_user_id,
    jsonb_build_object(p_key, p_value),
    v_updated
  )
  ON CONFLICT (user_id) DO UPDATE SET
    builder_state = jsonb_set(
      COALESCE(pedagia_workspace.builder_state, '{}'::jsonb),
      ARRAY[p_key],
      p_value,
      true
    ),
    updated_at = v_updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pedagia_patch_builder_state_key(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.pedagia_patch_builder_state_key(UUID, TEXT, JSONB) TO authenticated;
