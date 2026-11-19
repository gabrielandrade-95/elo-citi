import {runTask, providers} from '../lib/ia.js';

const MAX_BODY = 40_000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ok: false, reason: 'metodo'});

  const chain = providers();
  if (!chain.length) return res.status(503).json({ok: false, reason: 'sem_chave'});

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (JSON.stringify(body).length > MAX_BODY) return res.status(413).json({ok: false, reason: 'grande_demais'});

  try {
    return res.status(200).json(await runTask(body.task, body.input || {}, {chain}));
  } catch (err) {
    return res.status(err.status || 500).json({ok: false, reason: err.message});
  }
}
