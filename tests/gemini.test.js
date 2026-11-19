import test from 'node:test';
import assert from 'node:assert/strict';
import {runTask, unknownNumbers} from '../lib/gemini.js';

const fakeGemini = data => async () => new Response(JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(data)}]}}]}));

test('aceita texto que só usa números recebidos', async () => {
  const input = {pergunta: 'Onde o funil perde?', fatos: {a: 84, b: 45, r: 54}, rascunho: '45 de 84 passam (54%)'};
  const out = await runTask('leitura', input, {key: 'x', model: 'm', fetchImpl: fakeGemini({texto: 'Só 54% passam: 45 de 84.'})});
  assert.equal(out.ok, true);
});

test('descarta texto com número inventado', async () => {
  const input = {pergunta: 'Onde o funil perde?', fatos: {r: 54}, rascunho: '54%'};
  const out = await runTask('leitura', input, {key: 'x', model: 'm', fetchImpl: fakeGemini({texto: 'A conversão subiria 37%.'})});
  assert.equal(out.ok, false);
  assert.deepEqual(out.bad, [37]);
});

test('unknownNumbers ignora números presentes na entrada', () => {
  assert.deepEqual(unknownNumbers({t: '12 de 30'}, {n: 30, a: 12}), []);
});

test('busca na web devolve texto e fontes, sem checar números', async () => {
  const fake = async () => new Response(JSON.stringify({candidates: [{content: {parts: [{text: 'O setor cresceu 12% em 2025.'}]}, groundingMetadata: {groundingChunks: [{web: {uri: 'https://exemplo.com', title: 'exemplo.com'}}]}}]}));
  const out = await runTask('web', {pergunta: 'crescimento do varejo em PE'}, {key: 'x', model: 'm', fetchImpl: fake});
  assert.equal(out.ok, true);
  assert.equal(out.data.fontes.length, 1);
});
