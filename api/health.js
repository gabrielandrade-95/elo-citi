import {runTask, listModels} from '../lib/gemini.js';

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const out = {ok: true, ia: Boolean(key), modelo: model};
  const teste = req.query?.teste;
  if (key && teste === 'modelos') {
    try { out.modelos = (await listModels(key)).filter(m => /gemini/.test(m)); } catch (err) { out.erro = err.message; }
  }
  if (key && teste === 'texto') {
    const t0 = Date.now();
    try {
      const r = await runTask('leitura', {pergunta: 'teste', fatos: {taxa: 54}, rascunho: 'A taxa é 54%.'}, {key, model});
      out.teste = {tipo: teste, ok: r.ok, ms: Date.now() - t0, modelo: r.modelo, amostra: String(r.data?.texto || '').slice(0, 120)};
    } catch (err) {
      out.teste = {tipo: teste, ok: false, ms: Date.now() - t0, erro: err.message};
    }
  }
  res.status(200).json(out);
}
