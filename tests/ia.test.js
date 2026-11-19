import test from 'node:test';
import assert from 'node:assert/strict';
import {runTask, unknownNumbers, providers} from '../lib/ia.js';

const groq = {nome: 'groq', key: 'g', model: 'openai/gpt-oss-120b', cap: 1000};
const gemini = {nome: 'gemini', key: 'k', model: 'gemini-3.5-flash-lite', cap: 1000};
const answer = (url, data) => url.includes('groq')
  ? new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(data)}}]}))
  : new Response(JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(data)}]}}]}));

test('aceita texto que só usa números recebidos', async () => {
  const input = {pergunta: 'Onde o funil perde?', fatos: {a: 84, b: 45, r: 54}, rascunho: '45 de 84 passam (54%)'};
  const out = await runTask('leitura', input, {chain: [groq], fetchImpl: async u => answer(u, {texto: 'Só 54% passam: 45 de 84.'})});
  assert.equal(out.ok, true);
  assert.equal(out.provedor, 'groq');
});

test('descarta texto com número inventado', async () => {
  const input = {pergunta: 'Onde o funil perde?', fatos: {r: 54}, rascunho: '54%'};
  const out = await runTask('leitura', input, {chain: [groq], fetchImpl: async u => answer(u, {texto: 'A conversão subiria 37%.'})});
  assert.equal(out.ok, false);
  assert.deepEqual(out.bad, [37]);
});

test('usa o Gemini quando o Groq bate no limite', async () => {
  const input = {pergunta: 'x', fatos: {r: 54}, rascunho: '54%'};
  const fetchImpl = async u => u.includes('groq') ? new Response(JSON.stringify({error: {message: 'rate limit'}}), {status: 429}) : answer(u, {texto: '54% avançam.'});
  const out = await runTask('leitura', input, {chain: [groq, gemini], fetchImpl});
  assert.equal(out.ok, true);
  assert.equal(out.provedor, 'gemini');
});

test('ordem: Groq primeiro, Gemini Flash-Lite de reserva', () => {
  const chain = providers({GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k'}).map(p => `${p.nome}:${p.model}`);
  assert.deepEqual(chain, ['groq:openai/gpt-oss-120b', 'groq:llama-3.3-70b-versatile', 'gemini:gemini-3.5-flash-lite', 'gemini:gemini-3.1-flash-lite']);
});

test('unknownNumbers ignora números presentes na entrada', () => {
  assert.deepEqual(unknownNumbers({t: '12 de 30'}, {n: 30, a: 12}), []);
});
