import {runTask, providers, listModels} from '../lib/ia.js';

export default async function handler(req, res) {
  const chain = providers();
  const out = {ok: true, ia: chain.length > 0, ordem: chain.map(p => `${p.nome}: ${p.model}`)};
  const teste = req.query?.teste;
  if (teste === 'modelos' && process.env.GEMINI_API_KEY) {
    try { out.modelos_gemini = (await listModels(process.env.GEMINI_API_KEY)).filter(m => /gemini/.test(m)); } catch (err) { out.erro = err.message; }
  }
  if (teste === 'texto' && chain.length) {
    const t0 = Date.now();
    try {
      const r = await runTask('leitura', {pergunta: 'teste', fatos: {taxa: 54}, rascunho: 'A taxa é 54%.'}, {chain});
      out.teste = {ok: r.ok, ms: Date.now() - t0, respondeu: `${r.provedor}: ${r.modelo}`, amostra: String(r.data?.texto || '').slice(0, 120)};
    } catch (err) {
      out.teste = {ok: false, ms: Date.now() - t0, erro: err.message};
    }
  }
  res.status(200).json(out);
}
