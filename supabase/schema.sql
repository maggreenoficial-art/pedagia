-- ═══════════════════════════════════════════════════════════
-- Gerador de Provas com IA — Schema Supabase
-- Execute este arquivo no SQL Editor do painel Supabase:
-- https://supabase.com/dashboard → Project → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Tabela principal de provas
CREATE TABLE IF NOT EXISTS public.provas (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disciplina    TEXT        NOT NULL,
  serie         TEXT        NOT NULL,
  conteudo      TEXT        NOT NULL,
  tipo          TEXT        DEFAULT 'mista',
  dificuldade   TEXT        DEFAULT 'medio',
  num_questoes  INTEGER     DEFAULT 10,
  prova_text    TEXT,
  gabarito_text TEXT,
  escola        TEXT,
  professor     TEXT,
  -- Cabeçalho completo (secretaria, endereço, turno, bimestre, etc.)
  cabecalho     JSONB       DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 1b. Migration para tabelas já existentes (execute se a tabela já existia)
-- ALTER TABLE public.provas ADD COLUMN IF NOT EXISTS cabecalho JSONB DEFAULT '{}'::jsonb;

-- 2. Row Level Security — cada professor só vê/altera as próprias provas
ALTER TABLE public.provas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professores veem suas próprias provas"
  ON public.provas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Professores inserem suas próprias provas"
  ON public.provas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Professores deletam suas próprias provas"
  ON public.provas FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS provas_user_id_idx    ON public.provas (user_id);
CREATE INDEX IF NOT EXISTS provas_created_at_idx ON public.provas (created_at DESC);
CREATE INDEX IF NOT EXISTS provas_disciplina_idx ON public.provas (disciplina);
