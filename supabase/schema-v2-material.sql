-- PedagIA v2 — Material indexado (rodar após schema.sql)
-- SQL Editor → colar e executar

CREATE TABLE IF NOT EXISTS public.materials (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name       TEXT        NOT NULL,
  storage_path    TEXT,
  total_pages     INTEGER     DEFAULT 0,
  indexed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

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

CREATE TABLE IF NOT EXISTS public.chapter_images (
  id                      UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id              UUID        NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id                TEXT        NOT NULL,
  title                   TEXT,
  source_text             TEXT,
  page_number             INTEGER,
  storage_path            TEXT,
  image_type              TEXT        DEFAULT 'desconhecido',
  description             TEXT,
  usefulness_score        REAL        DEFAULT 0.5,
  contains_text_only      BOOLEAN     DEFAULT FALSE,
  is_full_page            BOOLEAN     DEFAULT FALSE,
  recommended_for_question BOOLEAN    DEFAULT FALSE,
  question_json           JSONB,
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (chapter_id, image_id)
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materials_own" ON public.materials;
CREATE POLICY "materials_own" ON public.materials FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapters_own" ON public.chapters;
CREATE POLICY "chapters_own" ON public.chapters FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "chapter_images_own" ON public.chapter_images;
CREATE POLICY "chapter_images_own" ON public.chapter_images FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chapters_material_idx ON public.chapters (material_id);
CREATE INDEX IF NOT EXISTS chapter_images_chapter_idx ON public.chapter_images (chapter_id);

-- ExamModel persistido na prova
ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS exam_model JSONB;

ALTER TABLE public.chapter_images ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.chapter_images ADD COLUMN IF NOT EXISTS source_text TEXT;
