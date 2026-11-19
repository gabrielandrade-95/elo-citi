const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const RULES = `Você é o CITi.AI, agente de estratégia do Comercial do CITi, empresa júnior de tecnologia do CIn-UFPE.
Regras que nunca podem ser quebradas:
- Use apenas os números que aparecem nos dados recebidos. Não calcule, não arredonde de outro jeito e não invente números.
- Se os dados não sustentam uma conclusão, diga isso em vez de supor.
- Escreva em português do Brasil, frases curtas, tom direto e humano, sem jargão de IA.`;
const JSON_ONLY = '\n- Responda somente com o JSON pedido.';

const TASKS = {
  leitura: {
    prompt: i => `Escreva a leitura de uma análise do funil comercial em 2 ou 3 frases, respondendo à pergunta.
Pergunta: ${i.pergunta}
Rascunho calculado pelo sistema (pode reescrever, mas mantenha os mesmos números): ${i.rascunho}
Dados calculados: ${JSON.stringify(i.fatos)}`,
    schema: {type: 'OBJECT', properties: {texto: {type: 'STRING'}}, required: ['texto']}
  },
  icp: {
    prompt: i => `Resuma em 2 frases a proposta de novo ICP para a Diretoria de Negócios: o que muda, o que se mantém e por quê.
ICP vigente: ${JSON.stringify(i.vigente)}
Proposta: ${JSON.stringify(i.proposta)}
Evidências calculadas pelo sistema: ${JSON.stringify(i.afirmacoes)}`,
    schema: {type: 'OBJECT', properties: {texto: {type: 'STRING'}}, required: ['texto']}
  },
  conversa: {
    prompt: i => `Você é o guia do time comercial dentro do ELO. Responda à mensagem do usuário.
Use como fonte apenas: BASE (dados do CITi), GLOSSARIO (treinamento comercial do CITi) e GUIA (como usar o ELO).
- Conceito do glossário, uso do ELO ou dado da base: tipo "resposta", em até 5 frases, e diga a fonte em "fonte".
- Pedido de métrica do funil que dá para calcular (taxa, conversão, fechamento ou boa entrega de um grupo de leads): tipo "metrica" e escreva em "consulta" o pedido em português simples, com o grupo e a medida. Não calcule nada.
- Se a resposta depende de algo fora dessas fontes (mercado, notícias, empresas de fora da base, conceitos que não estão no glossário): tipo "fora_da_base", com "texto" vazio. Nesta versão o ELO não faz pesquisa online, e o sistema mostra o aviso.
Perfil de quem pergunta: ${i.perfil}. Modo atual: ${i.modo}.
Conversa recente: ${JSON.stringify(i.historico || [])}
Mensagem: ${i.mensagem}
BASE: ${JSON.stringify(i.base?.dados || {})}
GLOSSARIO: ${JSON.stringify(i.base?.glossario || [])}
GUIA: ${JSON.stringify(i.base?.guia || [])}`,
    schema: {
      type: 'OBJECT',
      properties: {
        tipo: {type: 'STRING', enum: ['resposta', 'metrica', 'fora_da_base']},
        texto: {type: 'STRING'},
        fonte: {type: 'STRING'},
        consulta: {type: 'STRING'}
      },
      required: ['tipo', 'texto']
    }
  },
  dossie: {
    prompt: i => `Prepare a ligação de prospecção para esta empresa.
Empresa (dados públicos e estimativas): ${JSON.stringify(i.empresa)}
Quem liga: ${i.vendedor}, do CITi.
1. "abertura": 2 a 3 frases de abertura de cold call que usam o gatilho, se existir. Sem promessas de resultado.
2. "spin": exatamente 4 perguntas SPIN (Situação, Problema, Implicação, Necessidade), cada uma com o objetivo da pergunta.
Não invente fatos sobre a empresa além dos dados recebidos.`,
    schema: {
      type: 'OBJECT',
      properties: {
        abertura: {type: 'STRING'},
        spin: {type: 'ARRAY', items: {type: 'OBJECT', properties: {etapa: {type: 'STRING'}, pergunta: {type: 'STRING'}, objetivo: {type: 'STRING'}}, required: ['etapa', 'pergunta', 'objetivo']}}
      },
      required: ['abertura', 'spin']
    }
  }
};

const numbers = text => (String(text).match(/\d+(?:[.,]\d+)?/g) || []).map(n => Number(n.replace(',', '.')));

export function unknownNumbers(output, input) {
  const allowed = new Set((JSON.stringify(input).match(/\d+(?:\.\d+)?/g) || []).map(Number));
  return numbers(JSON.stringify(output)).filter(n => !allowed.has(n));
}

async function callGemini(model, request, key, fetchImpl, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
      body: JSON.stringify(request),
      signal: ctl.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(`O Gemini (${model}) demorou mais de ${ms / 1000} s para responder`), {status: 504, retry: true});
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function readError(res, model) {
  const t = await res.text().catch(() => '');
  let msg = t;
  try { msg = JSON.parse(t).error?.message || t; } catch {}
  return Object.assign(new Error(`Gemini (${model}) respondeu ${res.status}: ${String(msg).slice(0, 240)}`), {status: res.status === 429 ? 429 : 502, code: res.status, msg});
}

// Raciocínio mínimo: as respostas do ELO são curtas e os números já chegam calculados.
function thinking(model) {
  if (/2\.5-flash/.test(model)) return [{thinkingBudget: 0}];
  if (/gemini-3/.test(model)) return [{thinkingLevel: 'minimal'}, {thinkingLevel: 'low'}];
  return [];
}

export async function runTask(task, input, {key, model, fetchImpl = fetch, timeoutMs = 50000} = {}) {
  const t = TASKS[task];
  if (!t) throw Object.assign(new Error('Tarefa desconhecida'), {status: 400});
  const models = String(model).split(',').map(m => m.trim()).filter(Boolean);
  let lastErr;
  for (const m of models) {
    const gen = {temperature: 0.3, maxOutputTokens: 2048};
    const levels = thinking(m);
    if (levels.length) gen.thinkingConfig = levels[0];
    const build = g => ({systemInstruction: {parts: [{text: RULES + JSON_ONLY}]}, contents: [{role: 'user', parts: [{text: t.prompt(input)}]}], generationConfig: {...g, responseMimeType: 'application/json', responseSchema: t.schema}});
    try {
      const t0 = Date.now();
      let res = await callGemini(m, build(gen), key, fetchImpl, timeoutMs);
      for (let i = 1; res.status === 400 && gen.thinkingConfig; i++) {
        const err = await readError(res, m);
        if (!/thinking/i.test(err.msg)) throw err;
        if (levels[i]) gen.thinkingConfig = levels[i]; else delete gen.thinkingConfig;
        res = await callGemini(m, build(gen), key, fetchImpl, Math.max(5000, timeoutMs - (Date.now() - t0)));
      }
      if (!res.ok) throw await readError(res, m);
      const body = await res.json();
      const cand = body?.candidates?.[0];
      const raw = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      if (!raw) throw Object.assign(new Error(`Resposta vazia do Gemini (${cand?.finishReason || 'sem motivo'})`), {status: 502});
      const data = JSON.parse(raw);
      const bad = unknownNumbers(data, input);
      return bad.length ? {ok: false, reason: 'numeros', bad} : {ok: true, data, modelo: m};
    } catch (err) {
      lastErr = err;
      if (!(err.retry || err.code === 404 || err.code === 429)) throw err;
    }
  }
  throw lastErr;
}

export async function listModels(key, fetchImpl = fetch) {
  const res = await fetchImpl(`${ENDPOINT}?pageSize=200`, {headers: {'x-goog-api-key': key}});
  if (!res.ok) throw await readError(res, 'lista');
  const body = await res.json();
  return (body.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
}
