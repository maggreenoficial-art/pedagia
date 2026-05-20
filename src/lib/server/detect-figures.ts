export type DetectedFigure = {
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  source_text?: string;
};

/** bbox normalizado 0–1000 (estilo Qwen/Gemini) ou 0–1 */
export function parseDetectFiguresJson(
  raw: string,
  canvasW: number,
  canvasH: number,
): DetectedFigure[] {
  const m = raw.trim().match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as Array<Record<string, unknown>>;
    const out: DetectedFigure[] = [];
    for (const o of arr) {
      let x = Number(o.x ?? o.left ?? 0);
      let y = Number(o.y ?? o.top ?? 0);
      let w = Number(o.w ?? o.width ?? 0);
      let h = Number(o.h ?? o.height ?? 0);
      if (w <= 0 || h <= 0) continue;
      const norm = Math.max(x, y, w, h) <= 1.05;
      const norm1k = Math.max(x, y, w, h) <= 1000 && !norm;
      if (norm) {
        x *= canvasW;
        y *= canvasH;
        w *= canvasW;
        h *= canvasH;
      } else if (norm1k) {
        x = (x / 1000) * canvasW;
        y = (y / 1000) * canvasH;
        w = (w / 1000) * canvasW;
        h = (h / 1000) * canvasH;
      }
      out.push({
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        title: o.title ? String(o.title) : undefined,
        source_text: o.source_text ? String(o.source_text) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export const DETECT_FIGURES_PROMPT = `Você é especialista em layout de livros didáticos e provas de Geografia (Brasil).

PASSO 1 — Leia a PÁGINA INTEIRA antes de marcar qualquer caixa.

PASSO 2 — Cada retângulo = UM bloco editorial de figura (como em prova impressa):
INCLUIR (bordas apertadas):
- Faixa de título colorida (bege/laranja/roxo) com o nome da figura
- Mapa, gráfico, tabela, foto ou infográfico
- Legenda curta imediatamente abaixo da foto (máx. 2 linhas)
- Bloco "Fonte: ..." que pertence à figura (até o fim desse bloco)
- Crédito vertical na lateral (ex.: ADILSON SECCO/ARQUIVO DA EDITORA, JOAO MEIRELES/PULPRESS)

NÃO INCLUIR (erro comum):
- Enunciado de questão acima ("9. Analise a tabela...", "12. De acordo com o gráfico...")
- Alternativas a) b) c) d) e) à direita ou abaixo da figura
- Caixa "Explore" ou atividades numeradas
- Parágrafos da lição antes/depois ("Nesse modelo...", "Desigualdades no acesso...", "Indústria de entretenimento...")
- Texto da coluna vizinha que não faz parte da figura
- Linhas para resposta do aluno
- Número de página azul na margem

REFERÊNCIA — recorte correto em prova:
- Tabela "BRASIL: NÚMERO DE CONFLITOS..." = só faixa roxa + grade + Fonte da pesquisa (sem "9. Analise...")
- Mapa mundial = só o mapa colorido (sem enunciado nem linhas de resposta)
- Gráfico com faixa "Brasil: distribuição da população..." = faixa + gráficos + Fonte IBGE + crédito lateral (sem linhas de resposta abaixo)

PASSO 3 — bbox justo: margem máxima 8px além do bloco visual; altura típica 12–55% da página; largura 25–95%.

PASSO 4 — title e source_text literais da figura.

Coordenadas 0–1000, origem canto superior esquerdo.

Responda APENAS JSON array:
[{"x":120,"y":200,"w":720,"h":480,"title":"Brasil: rodovias — 2017","source_text":"Fonte: IBGE..."}]

Sem figura didática na página: [].`;
