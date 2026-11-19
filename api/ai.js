import {runTask} from '../lib/gemini.js';

const MAX_BODY = 40_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ok: false, reason: 'metodo'});

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ok: false, reason: 'sem_chave'});

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (JSON.stringify(body).length > MAX_BODY) return res.status(413).json({ok: false, reason: 'grande_demais'});

  try {
    const out = await runTask(body.task, body.input || {}, {key, model: process.env.GEMINI_MODEL || 'gemini-3.8-flash'});
    return res.status(200).json(out);
  } catch (err) {
    return res.status(err.status || 500).json({ok: false, reason: err.message});
  }
}
