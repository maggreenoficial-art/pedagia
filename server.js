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

// ── POST /api/provas — save exam ──────────────────────────────────────────────
app.post('/api/provas', auth, async (req, res) => {
  const { disciplina, serie, conteudo, tipo, dificuldade,
          num_questoes, prova_text, gabarito_text, escola, professor, cabecalho } = req.body;

  const { data, error } = await userClient(req.token)
    .from('provas')
    .insert({
      user_id: req.user.id,
      disciplina, serie, conteudo, tipo, dificuldade,
      num_questoes, prova_text, gabarito_text, escola, professor,
      cabecalho: cabecalho ?? {},
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
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
