import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Validate env ──────────────────────────────────────────────────────────────
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY'];
const missingEnv = REQUIRED.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`\n❌  Variáveis de ambiente ausentes: ${missingEnv.join(', ')}\n`);
  // Localmente encerra o processo; no Vercel apenas loga (process.exit quebraria a função)
  if (!process.env.VERCEL) process.exit(1);
}

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_PUBLISHABLE_KEY;
const OR_KEY        = process.env.OPENROUTER_API_KEY;
const OR_MODEL      = 'anthropic/claude-haiku-4-5';
const PORT          = process.env.PORT || 3000;

// Admin Supabase client (used only for JWT verification)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

// Per-request Supabase client (inherits user's RLS context)
function userClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
}

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ───────────────────────────────────────────────────────────
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }
  const token = header.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  req.user  = user;
  req.token = token;
  next();
}

// ── GET /api/config — serve public config to frontend ────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
});

// ── GET /api/status ───────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── POST /api/sumario — IA lê sumário e retorna lista de capítulos (JSON) ─────
app.post('/api/sumario', auth, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 10) {
    return res.status(400).json({ error: 'Texto do sumário muito curto.' });
  }

  const prompt = `Você é um assistente especialista em análise de livros e apostilas didáticos brasileiros.

Analise o texto abaixo, extraído de páginas de sumário/índice de um livro ou apostila.
Identifique TODOS os capítulos, unidades, módulos, temas ou seções principais, com seus números de página.

RETORNE APENAS um array JSON válido, sem texto antes ou depois, no formato:
[
  {"title": "Nome completo do capítulo/unidade", "pageNum": 12},
  {"title": "Outro capítulo", "pageNum": 34}
]

REGRAS:
- Inclua apenas capítulos/unidades/módulos principais (não subseções)
- Se não houver número de página, use null
- Não inclua: prefácio, apresentação, introdução geral, bibliografia, anexos, glossário, créditos
- Mantenha os títulos exatamente como aparecem no sumário
- Se o texto não for um sumário, retorne []

TEXTO DO SUMÁRIO:
${text.slice(0, 5000)}`;

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${PORT}`,
        'X-Title': 'Gerador de Provas com IA',
      },
      body: JSON.stringify({
        model:      OR_MODEL,
        stream:     false,
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: `OpenRouter: ${t}` });
    }

    const data    = await resp.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';

    // Extrai o array JSON da resposta (IA pode adicionar markdown code fences)
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      return res.status(422).json({ error: 'IA não retornou JSON válido.', raw: content });
    }

    const chapters = JSON.parse(match[0]);
    return res.json({ chapters });
  } catch (err) {
    console.error('Erro /api/sumario:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

function parseSuggestQuestionJson(raw, imageId) {
  const strip = String(raw || '').trim();
  const jsonMatch = strip.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]);
    const letters = ['a', 'b', 'c', 'd', 'e'];
    let alts = o.alternatives;
    if (!Array.isArray(alts) || alts.length < 5) {
      alts = letters.map(letter => {
        const found = (o.alternatives || []).find(a =>
          String(a.letter || a.letra || '').toLowerCase() === letter
        );
        return { letter, text: String(found?.text || found?.texto || '').trim() };
      });
    } else {
      alts = alts.slice(0, 5).map((a, i) => ({
        letter: String(a.letter || a.letra || letters[i]).toLowerCase(),
        text:   String(a.text || a.texto || '').trim(),
      }));
    }
    const correct = String(o.correctAnswer || o.gabarito || o.resposta || 'a').toLowerCase().replace(/[^a-e]/g, '') || 'a';
    const statement = String(o.statement || o.enunciado || o.questao || '').trim();
    if (!statement) return null;
    return {
      imageId: String(o.imageId || imageId),
      statement,
      alternatives: alts,
      correctAnswer: letters.includes(correct) ? correct : 'a',
    };
  } catch {
    return null;
  }
}

function parseSuggestQuestionText(raw, imageId) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const gabM = text.match(/\[Gabarito:\s*([a-e])\s*\]/i);
  const correctAnswer = (gabM?.[1] || 'a').toLowerCase();
  const body = text.replace(/\[Gabarito:[^\]]+\]/gi, '').trim();
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const alternatives = [];
  let statementLines = [];
  for (const line of lines) {
    const am = line.match(/^([a-e])\)\s*(.+)/i);
    if (am) alternatives.push({ letter: am[1].toLowerCase(), text: am[2].trim() });
    else statementLines.push(line.replace(/\*\*/g, ''));
  }
  const statement = statementLines.join(' ').trim();
  if (!statement || alternatives.length < 5) return null;
  return { imageId, statement, alternatives: alternatives.slice(0, 5), correctAnswer };
}

// ── POST /api/sugerir-questao — IA sugere 1 questão para uma imagem (por imageId) ─
app.post('/api/sugerir-questao', auth, async (req, res) => {
  const { imageId, imageBase64, srcHint, disc, serie, caption, pageNumber } = req.body;
  if (!imageId) return res.status(400).json({ error: 'imageId não fornecido.' });
  if (!imageBase64) return res.status(400).json({ error: 'Imagem não fornecida.' });

  const disciplina = disc || 'disciplina';
  const serie_     = serie || 'ensino médio';
  const fonteInfo  = srcHint || caption
    ? `Fonte visível na imagem: "${srcHint || caption}". Use EXATAMENTE essa fonte no enunciado, se aplicável.`
    : 'Sem fonte visível — NÃO invente fonte.';

  const prompt = `Você é um elaborador de provas para escola estadual brasileira.
Analise a imagem (página ${pageNumber || '?'}) e crie UMA questão de múltipla escolha para ${disciplina} — ${serie_}.

${fonteInfo}

REGRAS OBRIGATÓRIAS:
- Responda APENAS com JSON válido (sem markdown, sem texto antes ou depois).
- O campo "imageId" DEVE ser exatamente: "${imageId}"
- O "statement" descreve o contextualizador + comando; NUNCA use [IMAGEM], [Imagem 1] ou placeholder de imagem.
- Exatamente 5 alternativas com letras a, b, c, d, e em minúsculas.
- "correctAnswer" é uma letra de a a e.

Formato:
{
  "imageId": "${imageId}",
  "statement": "texto do enunciado completo em texto simples",
  "alternatives": [
    {"letter":"a","text":"..."},
    {"letter":"b","text":"..."},
    {"letter":"c","text":"..."},
    {"letter":"d","text":"..."},
    {"letter":"e","text":"..."}
  ],
  "correctAnswer": "c"
}`;

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`,
        'X-Title': 'Gerador de Provas com IA',
      },
      body: JSON.stringify({
        model:      OR_MODEL,
        stream:     false,
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: `OpenRouter: ${t.slice(0,200)}` });
    }
    const data    = await resp.json();
    const raw     = data.choices?.[0]?.message?.content?.trim() || '';
    let parsed    = parseSuggestQuestionJson(raw, imageId) || parseSuggestQuestionText(raw, imageId);
    if (!parsed) {
      return res.status(502).json({ error: 'Não foi possível interpretar a questão gerada pela IA.' });
    }
    if (parsed.imageId !== imageId) {
      return res.status(500).json({ error: 'A IA retornou uma questão para outra imagem.' });
    }
    if (/\[\s*imagem|imagem\s*\d+/i.test(parsed.statement)) {
      return res.status(400).json({ error: 'Enunciado contém placeholder de imagem — regenere a sugestão.' });
    }
    return res.json({
      imageId,
      question: {
        statement:      parsed.statement,
        alternatives:   parsed.alternatives,
        correctAnswer:  parsed.correctAnswer,
      },
      questao: parsed.statement, // compat. visualização legada
    });
  } catch (err) {
    console.error('Erro /api/sugerir-questao:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/gerar — OpenRouter streaming via SSE (suporta multimodal) ──────
app.post('/api/gerar', auth, async (req, res) => {
  const { prompt, images } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.length < 20) {
    return res.status(400).json({ error: 'Prompt inválido.' });
  }

  // Constrói conteúdo da mensagem — texto puro ou texto + imagens (multimodal)
  const imgs = Array.isArray(images) ? images.slice(0, 4) : [];
  let messageContent;
  if (imgs.length > 0) {
    messageContent = [
      { type: 'text', text: prompt },
      ...imgs.map(img => ({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}`,
        },
      })),
    ];
  } else {
    messageContent = prompt;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${PORT}`,
        'X-Title':      'Gerador de Provas com IA',
      },
      body: JSON.stringify({
        model:      OR_MODEL,
        stream:     true,
        max_tokens: 4096,
        messages:   [{ role: 'user', content: messageContent }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.write(`data: ${JSON.stringify({ error: `OpenRouter: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    const reader  = upstream.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { res.write('data: [DONE]\n\n'); break; }

        try {
          const parsed = JSON.parse(raw);
          const text   = parsed.choices?.[0]?.delta?.content;
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch { /* ignore malformed SSE line */ }
      }
    }

    res.end();
  } catch (err) {
    console.error('Erro OpenRouter:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ── GET /api/provas — list user's saved exams ─────────────────────────────────
app.get('/api/provas', auth, async (req, res) => {
  const { data, error } = await userClient(req.token)
    .from('provas')
    .select('id, disciplina, serie, conteudo, tipo, dificuldade, num_questoes, escola, professor, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── GET /api/provas/:id — load full exam text ─────────────────────────────────
app.get('/api/provas/:id', auth, async (req, res) => {
  const { data, error } = await userClient(req.token)
    .from('provas')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Prova não encontrada.' });
  res.json(data);
});

// Monta registro compatível com tabelas antigas (sem coluna cabecalho JSONB)
function buildProvaRow(userId, body) {
  const { disciplina, serie, conteudo, tipo, dificuldade,
          num_questoes, prova_text, gabarito_text, escola, professor,
          cabecalho, builder_snapshot } = body;

  const row = {
    user_id: userId,
    disciplina: String(disciplina || '').trim() || 'Sem disciplina',
    serie: String(serie || '').trim() || '—',
    conteudo: String(conteudo || '').trim()
      || String(prova_text || '').slice(0, 120).trim()
      || 'Prova gerada',
    tipo: tipo || 'Prova',
    dificuldade: dificuldade || 'medio',
    num_questoes: Number(num_questoes) || 10,
    prova_text: String(prova_text || ''),
    gabarito_text: gabarito_text ? String(gabarito_text) : '',
    escola: escola || null,
    professor: professor || null,
  };

  if (cabecalho && typeof cabecalho === 'object') row.cabecalho = cabecalho;
  if (builder_snapshot && typeof builder_snapshot === 'object') row.builder_snapshot = builder_snapshot;

  return row;
}

// ── POST /api/provas — save exam ──────────────────────────────────────────────
app.post('/api/provas', auth, async (req, res) => {
  if (!req.body?.prova_text || !String(req.body.prova_text).trim()) {
    return res.status(400).json({ error: 'Texto da prova vazio.' });
  }

  const row = buildProvaRow(req.user.id, req.body);
  const { data, error } = await userClient(req.token)
    .from('provas')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar prova:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// ── PUT /api/provas/:id — update saved exam ───────────────────────────────────
app.put('/api/provas/:id', auth, async (req, res) => {
  const updates = buildProvaRow(req.user.id, { ...req.body, user_id: undefined });
  delete updates.user_id;

  const { data, error } = await userClient(req.token)
    .from('provas')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Prova não encontrada.' });
  res.json(data);
});

// ── DELETE /api/provas/:id ────────────────────────────────────────────────────
app.delete('/api/provas/:id', auth, async (req, res) => {
  const { error } = await userClient(req.token)
    .from('provas')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Fallback → index.html ─────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Localmente inicia o servidor normalmente; no Vercel exporta o app como handler
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n✅  Gerador de Provas rodando em http://localhost:${PORT}\n`);
    console.log(`   Modelo: ${OR_MODEL} via OpenRouter`);
    console.log(`   Banco:  ${SUPABASE_URL}\n`);
  });
}

export default app;
