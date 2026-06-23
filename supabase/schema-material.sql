-- ═══════════════════════════════════════════════════════════
-- PedagIA — Tabelas de Material (livros / capítulos / imagens)
-- Supabase → SQL Editor → New query → colar tudo → Run
--
-- Se já rodou schema.sql, basta este arquivo.
-- Se o projeto é novo, rode antes: supabase/schema.sql
-- ═══════════════════════════════════════════════════════════

-- ── Materiais (PDFs do professor) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.materials (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name    TEXT        NOT NULL,
  storage_path TEXT,
  total_pages  INTEGER     DEFAULT 0,
  indexed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS materials_user_id_idx ON public.materials (user_id);
CREATE INDEX IF NOT EXISTS materials_created_at_idx ON public.materials (created_at DESC);
CREATE INDEX IF NOT EXISTS materials_updated_at_idx ON public.materials (updated_at DESC);

-- Migração: bancos criados antes de updated_at (ex.: página Fluxos)
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
UPDATE public.materials SET updated_at = COALESCE(created_at, NOW()) WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.pedagia_materials_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materials_set_updated_at ON public.materials;
CREATE TRIGGER materials_set_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.pedagia_materials_set_updated_at();

-- ── Capítulos por material ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chapters (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id         UUID        NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  printed_page_start  INTEGER,
  pdf_page_start      INTEGER     NOT NULL,
  pdf_page_end        INTEGER     NOT NULL,
  indexed             BOOLEAN     DEFAULT FALSE,
  text_blob           JSONB       DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS chapters_material_idx ON public.chapters (material_id);
CREATE INDEX IF NOT EXISTS chapters_user_id_idx ON public.chapters (user_id);

-- ── Imagens recortadas por capítulo ─────────────────────────
CREATE TABLE IF NOT EXISTS public.chapter_images (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id               UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id                 TEXT        NOT NULL,
  title                    TEXT,
  source_text              TEXT,
  page_number              INTEGER,
  storage_path             TEXT,
  image_type               TEXT        DEFAULT 'desconhecido',
  description              TEXT,
  usefulness_score         REAL        DEFAULT 0.5,
  contains_text_only       BOOLEAN     DEFAULT FALSE,
  is_full_page             BOOLEAN     DEFAULT FALSE,
  recommended_for_question BOOLEAN     DEFAULT FALSE,
  question_json            JSONB,
  created_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (chapter_id, image_id)
);

CREATE INDEX IF NOT EXISTS chapter_images_chapter_idx ON public.chapter_images (chapter_id);
CREATE INDEX IF NOT EXISTS chapter_images_user_id_idx ON public.chapter_images (user_id);

-- Colunas extras (instalações antigas do v2 parcial)
ALTER TABLE public.chapter_images ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.chapter_images ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS exam_model JSONB;

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materials_select_own" ON public.materials;
DROP POLICY IF EXISTS "materials_insert_own" ON public.materials;
DROP POLICY IF EXISTS "materials_update_own" ON public.materials;
DROP POLICY IF EXISTS "materials_delete_own" ON public.materials;
DROP POLICY IF EXISTS "materials_own" ON public.materials;

CREATE POLICY "materials_select_own" ON public.materials FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "materials_insert_own" ON public.materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_update_own" ON public.materials FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "materials_delete_own" ON public.materials FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapters_select_own" ON public.chapters;
DROP POLICY IF EXISTS "chapters_insert_own" ON public.chapters;
DROP POLICY IF EXISTS "chapters_update_own" ON public.chapters;
DROP POLICY IF EXISTS "chapters_delete_own" ON public.chapters;
DROP POLICY IF EXISTS "chapters_own" ON public.chapters;

CREATE POLICY "chapters_select_own" ON public.chapters FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "chapters_insert_own" ON public.chapters FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chapters_update_own" ON public.chapters FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chapters_delete_own" ON public.chapters FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapter_images_select_own" ON public.chapter_images;
DROP POLICY IF EXISTS "chapter_images_insert_own" ON public.chapter_images;
DROP POLICY IF EXISTS "chapter_images_update_own" ON public.chapter_images;
DROP POLICY IF EXISTS "chapter_images_delete_own" ON public.chapter_images;
DROP POLICY IF EXISTS "chapter_images_own" ON public.chapter_images;

CREATE POLICY "chapter_images_select_own" ON public.chapter_images FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "chapter_images_insert_own" ON public.chapter_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chapter_images_update_own" ON public.chapter_images FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chapter_images_delete_own" ON public.chapter_images FOR DELETE
  USING (auth.uid() = user_id);

-- ── Permissões para usuários autenticados (API / PostgREST) ─
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapter_images TO authenticated;

GRANT ALL ON public.materials TO service_role;
GRANT ALL ON public.chapters TO service_role;
GRANT ALL ON public.chapter_images TO service_role;

-- Recarrega cache do PostgREST (evita "table not in schema cache")
NOTIFY pgrst, 'reload schema';
