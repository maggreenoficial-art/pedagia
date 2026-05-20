export function parseSuggestQuestionJson(raw: string, imageId: string) {
  const strip = String(raw || '').trim();
  const jsonMatch = strip.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const letters = ['a', 'b', 'c', 'd', 'e'];
    let alts = o.alternatives as Array<Record<string, string>> | undefined;
    if (!Array.isArray(alts) || alts.length < 5) {
      alts = letters.map((letter) => {
        const found = ((o.alternatives as Array<Record<string, string>>) || []).find((a) =>
          String(a.letter || a.letra || '').toLowerCase() === letter,
        );
        return { letter, text: String(found?.text || found?.texto || '').trim() };
      });
    } else {
      alts = alts.slice(0, 5).map((a, i) => ({
        letter: String(a.letter || a.letra || letters[i]).toLowerCase(),
        text: String(a.text || a.texto || '').trim(),
      }));
    }
    const correct =
      String(o.correctAnswer || o.gabarito || o.resposta || 'a')
        .toLowerCase()
        .replace(/[^a-e]/g, '') || 'a';
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

export function parseSuggestQuestionText(raw: string, imageId: string) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const gabM = text.match(/\[Gabarito:\s*([a-e])\s*\]/i);
  const correctAnswer = (gabM?.[1] || 'a').toLowerCase();
  const body = text.replace(/\[Gabarito:[^\]]+\]/gi, '').trim();
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const alternatives: { letter: string; text: string }[] = [];
  const statementLines: string[] = [];
  for (const line of lines) {
    const am = line.match(/^([a-e])\)\s*(.+)/i);
    if (am) alternatives.push({ letter: am[1].toLowerCase(), text: am[2].trim() });
    else statementLines.push(line.replace(/\*\*/g, ''));
  }
  const statement = statementLines.join(' ').trim();
  if (!statement || alternatives.length < 5) return null;
  return { imageId, statement, alternatives: alternatives.slice(0, 5), correctAnswer };
}
