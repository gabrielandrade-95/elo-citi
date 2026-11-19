import {runTask} from '../lib/gemini.js';

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const out = {ok: true, ia: Boolean(key), modelo: model};
  const teste = req.query?.teste;
  if (key && (teste === 'texto' || teste === 'web')) {
    const t0 = Date.now();
    try {
      const r = teste === 'web'
        ? await runTask('web', {pergunta: 'Qual é a capital de Pernambuco?'}, {key, model})
        : await runTask('leitura', {pergunta: 'teste', fatos: {taxa: 54}, rascunho: 'A taxa é 54%.'}, {key, model});
      out.teste = {tipo: teste, ok: r.ok, ms: Date.now() - t0, amostra: String(r.data?.texto || '').slice(0, 120), fontes: r.data?.fontes?.length};
    } catch (err) {
      out.teste = {tipo: teste, ok: false, ms: Date.now() - t0, erro: err.message};
    }
  }
  res.status(200).json(out);
}
