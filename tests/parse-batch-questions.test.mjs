import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchQuestionsJson } from '../src/lib/server/parse-batch-questions.ts';

const mcQuestion = (id) => ({
  id,
  type: 'multiple_choice',
  statement: `Enunciado da questão ${id} sobre o material.`,
  alternatives: [
    { letter: 'a', text: 'Alternativa A' },
    { letter: 'b', text: 'Alternativa B' },
    { letter: 'c', text: 'Alternativa C' },
    { letter: 'd', text: 'Alternativa D' },
    { letter: 'e', text: 'Alternativa E' },
  ],
  correctAnswer: 'c',
  justification: 'Porque sim, segundo o texto.',
});

test('JSON válido com MC e discursiva', () => {
  const raw = JSON.stringify({
    questions: [
      mcQuestion(1),
      { id: 2, type: 'discursive', statement: 'Explique o conceito apresentado.' },
    ],
    pedagogicalNote: 'Nota para o professor.',
  });
  const { questions, pedagogicalNote } = parseBatchQuestionsJson(raw);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].type, 'multiple_choice');
  assert.equal(questions[0].correctAnswer, 'c');
  assert.equal(questions[1].type, 'discursive');
  assert.equal(pedagogicalNote, 'Nota para o professor.');
});

test('JSON cercado por markdown e texto extra', () => {
  const raw = 'Aqui está:\n```json\n' + JSON.stringify({ questions: [mcQuestion(1)] }) + '\n```\nFim.';
  const { questions } = parseBatchQuestionsJson(raw);
  assert.equal(questions.length, 1);
});

test('chaves em português (enunciado/alternativas/gabarito)', () => {
  const raw = JSON.stringify({
    questoes: [
      {
        enunciado: 'Questão em português.',
        alternativas: [
          { letra: 'a', texto: 'Um' },
          { letra: 'b', texto: 'Dois' },
          { letra: 'c', texto: 'Três' },
          { letra: 'd', texto: 'Quatro' },
          { letra: 'e', texto: 'Cinco' },
        ],
        gabarito: 'B) Dois',
        justificativa: 'Conforme o texto.',
      },
    ],
  });
  const { questions } = parseBatchQuestionsJson(raw);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].correctAnswer, 'b');
  assert.equal(questions[0].alternatives[1].text, 'Dois');
});

test('MC incompleta (menos de 5 alternativas) é descartada', () => {
  const raw = JSON.stringify({
    questions: [
      {
        type: 'multiple_choice',
        statement: 'Só tem duas alternativas.',
        alternatives: [
          { letter: 'a', text: 'Um' },
          { letter: 'b', text: 'Dois' },
        ],
        correctAnswer: 'a',
      },
      mcQuestion(2),
    ],
  });
  const { questions } = parseBatchQuestionsJson(raw);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].statement, mcQuestion(2).statement);
});

test('entrada sem JSON retorna vazio', () => {
  assert.deepEqual(parseBatchQuestionsJson('a IA falhou e respondeu prosa'), {
    questions: [],
    pedagogicalNote: '',
  });
  assert.deepEqual(parseBatchQuestionsJson(''), { questions: [], pedagogicalNote: '' });
});

test('prefixo [DISCURSIVA] vira tipo discursivo e é removido', () => {
  const raw = JSON.stringify({
    questions: [{ statement: '[DISCURSIVA] Disserte sobre o tema.' }],
  });
  const { questions } = parseBatchQuestionsJson(raw);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, 'discursive');
  assert.ok(!questions[0].statement.includes('[DISCURSIVA]'));
});
