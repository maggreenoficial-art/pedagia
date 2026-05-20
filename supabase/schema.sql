-- ═══════════════════════════════════════════════════════════
-- PedagIA — Schema Supabase (idempotente: pode rodar de novo)
-- SQL Editor: https://supabase.com/dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. Provas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provas (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disciplina       TEXT        NOT NULL,
  serie            TEXT        NOT NULL,
  conteudo         TEXT        NOT NULL,
  tipo             TEXT        DEFAULT 'mista',
  dificuldade      TEXT        DEFAULT 'medio',
  num_questoes     INTEGER     DEFAULT 10,
  prova_text       TEXT,
  gabarito_text    TEXT,
  escola           TEXT,
  professor        TEXT,
  cabecalho        JSONB       DEFAULT '{}'::jsonb,
  builder_snapshot JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS cabecalho JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS builder_snapshot JSONB;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS exam_model JSONB;

ALTER TABLE public.provas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professores veem suas próprias provas" ON public.provas;
DROP POLICY IF EXISTS "Professores inserem suas próprias provas" ON public.provas;
DROP POLICY IF EXISTS "Professores atualizam suas próprias provas" ON public.provas;
DROP POLICY IF EXISTS "Professores deletam suas próprias provas" ON public.provas;

CREATE POLICY "Professores veem suas próprias provas"
  ON public.provas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Professores inserem suas próprias provas"
  ON public.provas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Professores atualizam suas próprias provas"
  ON public.provas FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Professores deletam suas próprias provas"
  ON public.provas FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS provas_user_id_idx    ON public.provas (user_id);
CREATE INDEX IF NOT EXISTS provas_created_at_idx ON public.provas (created_at DESC);
CREATE INDEX IF NOT EXISTS provas_disciplina_idx ON public.provas (disciplina);

-- ── 2. Workspace (builder + cabeçalhos — arquivos no Storage) ─
CREATE TABLE IF NOT EXISTS public.pedagia_workspace (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  book_storage_path TEXT,
  book_file_name    TEXT,
  book_total_pages  INTEGER,
  builder_state     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  headers_index     JSONB       NOT NULL DEFAULT '{"activeId":null,"items":[]}'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pedagia_workspace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_select_own" ON public.pedagia_workspace;
DROP POLICY IF EXISTS "workspace_insert_own" ON public.pedagia_workspace;
DROP POLICY IF EXISTS "workspace_update_own" ON public.pedagia_workspace;

CREATE POLICY "workspace_select_own"
  ON public.pedagia_workspace FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "workspace_insert_own"
  ON public.pedagia_workspace FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "workspace_update_own"
  ON public.pedagia_workspace FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Storage bucket pedagia (imagens, PDFs, cabeçalhos) ───
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pedagia', 'pedagia', false, 209715200)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 209715200;

DROP POLICY IF EXISTS "pedagia_select_own" ON storage.objects;
DROP POLICY IF EXISTS "pedagia_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "pedagia_update_own" ON storage.objects;
DROP POLICY IF EXISTS "pedagia_delete_own" ON storage.objects;

CREATE POLICY "pedagia_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pedagia' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pedagia_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pedagia' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pedagia_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pedagia' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "pedagia_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pedagia' AND (storage.foldername(name))[1] = auth.uid()::text);
