import { NextResponse } from 'next/server';
import {
  assertOpenRouterConfigured,
  fetchOpenRouterPedagia,
  readOpenRouterErrorResponse,
} from '@/lib/server/openrouter';
import { getTeacherProfile, saveTeacherProfile } from '@/lib/server/teacher-profile-store';
import type { TeacherWritingProfile } from '@/lib/teacher-profile/types';
import type { TeacherSampleExam } from '@/lib/teacher-profile/types';
import {
  SAMPLE_TEXT_MIN,
  collectSampleTexts,
  sanitizeSampleExams,
} from '@/lib/teacher-profile/sanitize';
import { requireUser, userClient } from '@/lib/server/supabase';
import { formatDbError } from '@/lib/server/db-error';

export const maxDuration = 90;

function parseWritingProfile(raw: string): TeacherWritingProfile | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const p = JSON.parse(jsonMatch[0]) as Record<string, string>;
    const summary = String(p.summary || '').trim();
    if (!summary) return null;
    const tone = String(p.tone || '').trim();
    const vocabulary = String(p.vocabulary || '').trim();
    const structure = String(p.structure || '').trim();
    const promptBlock = String(p.promptBlock || '').trim();
    return {
      summary,
      tone,
      vocabulary,
      structure,
      promptBlock:
        promptBlock ||
        `Resumo: ${summary}\nTom: ${tone}\nVocabulário: ${vocabulary}\nEstrutura: ${structure}`,
      analyzedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function textsFromBody(body: Record<string, unknown>): string[] {
  const fromSamples = Array.isArray(body.samples)
    ? body.samples.map(String).map((t) => t.trim()).filter((t) => t.length >= SAMPLE_TEXT_MIN)
    : [];

  if (fromSamples.length) return fromSamples;

  if (Array.isArray(body.sampleExams)) {
    const sanitized = sanitizeSampleExams(body.sampleExams as TeacherSampleExam[]);
    return collectSampleTexts(sanitized);
  }

  return [];
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ('error' in auth) return auth.error;

  const sb = userClient(auth.token);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const profile = await getTeacherProfile(sb, auth.user.id);

  const textsFromRequest = textsFromBody(body);
  const texts =
    textsFromRequest.length > 0
      ? textsFromRequest
      : collectSampleTexts(profile.sampleExams);

  if (!texts.length) {
    return NextResponse.json(
      {
        error:
          'Envie ao menos uma prova de exemplo (Word .docx, PDF ou texto) e aguarde o upload concluir antes de analisar.',
      },
      { status: 400 },
    );
  }

  const displayName = String(body.displayName ?? profile.displayName ?? '').trim();
  const subjects = String(body.subjects ?? profile.subjects ?? '').trim();
  const bio = String(body.bio ?? profile.bio ?? '').trim();

  const joined = texts
    .slice(0, 5)
    .map((t: string, i: number) => `--- AMOSTRA ${i + 1} ---\n${t.slice(0, 12000)}`)
    .join('\n\n');

  const prompt = `Você é especialista em linguística pedagógica. Analise as provas/atividades abaixo escritas pelo MESMO professor e extraia um perfil de escrita reutilizável em gerações futuras de IA.

Professor: ${displayName || '(nome não informado)'}
Disciplinas: ${subjects || '(não informado)'}
Bio: ${bio || '(não informada)'}

AMOSTRAS (podem vir de arquivos Word .docx exportados):
${joined}

Responda APENAS com JSON válido:
{
  "summary": "2-4 frases sobre o estilo geral",
  "tone": "formal/informal, proximidade, motivacional, etc.",
  "vocabulary": "palavras e expressões recorrentes, nível de linguagem",
  "structure": "como organiza enunciados, alternativas, comandos",
  "promptBlock": "Parágrafo completo (8-12 linhas) que uma IA deve seguir para imitar este professor em novas questões"
}`;

  try {
    assertOpenRouterConfigured();
    const resp = await fetchOpenRouterPedagia({
      task: 'exam_generation',
      stream: false,
      temperature: 0.4,
      max_tokens: 2500,
      user: prompt,
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: await readOpenRouterErrorResponse(resp) },
        { status: 502 },
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const writingProfile = parseWritingProfile(raw);
    if (!writingProfile) {
      return NextResponse.json(
        { error: 'Não foi possível interpretar o perfil. Tente de novo.' },
        { status: 502 },
      );
    }

    const saved = await saveTeacherProfile(sb, auth.user.id, {
      ...profile,
      displayName: displayName || profile.displayName,
      subjects: subjects || profile.subjects,
      bio: bio || profile.bio,
      writingProfile,
    });

    return NextResponse.json({ profile: saved, writingProfile });
  } catch (e) {
    return NextResponse.json(
      { error: formatDbError(e) || 'Erro na análise.' },
      { status: 500 },
    );
  }
}
