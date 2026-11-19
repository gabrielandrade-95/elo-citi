// Camada de IA do ELO: o Groq responde primeiro e o Gemini fica de reserva.
// Toda resposta passa pela checagem de números antes de voltar para a tela.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';

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

const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);

// Ordem de tentativa, montada a partir das variáveis de ambiente.
export function providers(env = process.env) {
  const out = [];
  if (env.GROQ_API_KEY) for (const model of list(env.GROQ_MODEL || 'openai/gpt-oss-120b,llama-3.3-70b-versatile')) out.push({nome: 'groq', key: env.GROQ_API_KEY, model, cap: 15000});
  if (env.GEMINI_API_KEY) for (const model of list(env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite')) out.push({nome: 'gemini', key: env.GEMINI_API_KEY, model, cap: 20000});
  return out;
}

async function post(url, headers, body, fetchImpl, ms, label) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchImpl(url, {method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(body), signal: ctl.signal});
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error(`${label} demorou mais de ${Math.round(ms / 1000)} s para responder`), {status: 504, retry: true});
    throw Object.assign(new Error(`${label}: falha de rede (${err.message})`), {status: 502, retry: true});
  } finally {
    clearTimeout(timer);
  }
}

async function readError(res, label) {
  const t = await res.text().catch(() => '');
  let msg = t;
  try { msg = JSON.parse(t).error?.message || t; } catch {}
  return Object.assign(new Error(`${label} respondeu ${res.status}: ${String(msg).slice(0, 240)}`), {status: res.status === 429 ? 429 : 502, code: res.status, msg});
}

// O Groq recebe o formato no próprio prompt e responde em modo JSON.
async function askGroq(p, t, input, fetchImpl, ms) {
  const label = `Groq (${p.model})`;
  const body = {
    model: p.model,
    temperature: 0.3,
    max_completion_tokens: 2048,
    response_format: {type: 'json_object'},
    messages: [
      {role: 'system', content: `${RULES}${JSON_ONLY}\n- Formato do JSON (tipos em maiúsculas, como no padrão do Google): ${JSON.stringify(t.schema)}`},
      {role: 'user', content: t.prompt(input)}
    ]
  };
  if (/gpt-oss/.test(p.model)) body.reasoning_effort = 'low';
  const res = await post(GROQ, {Authorization: `Bearer ${p.key}`}, body, fetchImpl, ms, label);
  if (!res.ok) throw await readError(res, label);
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content || '';
  if (!raw) throw Object.assign(new Error(`${label}: resposta vazia`), {status: 502});
  return raw;
}

// Raciocínio mínimo: as respostas do ELO são curtas e os números já chegam calculados.
function thinking(model) {
  if (/2\.5-flash/.test(model)) return [{thinkingBudget: 0}];
  if (/gemini-3/.test(model)) return [{thinkingLevel: 'minimal'}, {thinkingLevel: 'low'}];
  return [];
}

async function askGemini(p, t, input, fetchImpl, ms) {
  const label = `Gemini (${p.model})`, url = `${GEMINI}/${p.model}:generateContent`, headers = {'x-goog-api-key': p.key};
  const levels = thinking(p.model), gen = {temperature: 0.3, maxOutputTokens: 2048};
  if (levels.length) gen.thinkingConfig = levels[0];
  const build = () => ({systemInstruction: {parts: [{text: RULES + JSON_ONLY}]}, contents: [{role: 'user', parts: [{text: t.prompt(input)}]}], generationConfig: {...gen, responseMimeType: 'application/json', responseSchema: t.schema}});
  const t0 = Date.now();
  let res = await post(url, headers, build(), fetchImpl, ms, label);
  for (let i = 1; res.status === 400 && gen.thinkingConfig; i++) {
    const err = await readError(res, label);
    if (!/thinking/i.test(err.msg)) throw err;
    if (levels[i]) gen.thinkingConfig = levels[i]; else delete gen.thinkingConfig;
    res = await post(url, headers, build(), fetchImpl, Math.max(3000, ms - (Date.now() - t0)), label);
  }
  if (!res.ok) throw await readError(res, label);
  const cand = (await res.json())?.candidates?.[0];
  const raw = (cand?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('');
  if (!raw) throw Object.assign(new Error(`${label}: resposta vazia (${cand?.finishReason || 'sem motivo'})`), {status: 502});
  return raw;
}

const parseJSON = raw => JSON.parse(String(raw).replace(/^```(?:json)?\s*|\s*```$/g, ''));

export async function runTask(task, input, {chain = providers(), fetchImpl = fetch, budgetMs = 52000} = {}) {
  const t = TASKS[task];
  if (!t) throw Object.assign(new Error('Tarefa desconhecida'), {status: 400});
  if (!chain.length) throw Object.assign(new Error('Nenhuma chave de IA configurada'), {status: 503});
  const end = Date.now() + budgetMs;
  const erros = [];
  for (const p of chain) {
    const left = end - Date.now();
    if (left < 3000) break;
    try {
      const raw = await (p.nome === 'groq' ? askGroq : askGemini)(p, t, input, fetchImpl, Math.min(p.cap, left));
      const data = parseJSON(raw);
      const bad = unknownNumbers(data, input);
      if (bad.length) return {ok: false, reason: 'numeros', bad, provedor: p.nome, modelo: p.model};
      return {ok: true, data, provedor: p.nome, modelo: p.model};
    } catch (err) {
      erros.push(err.message);
      if (err.code === 401 || err.code === 403) continue;
    }
  }
  throw Object.assign(new Error(erros.join(' | ') || 'Sem tempo para tentar a IA'), {status: 504});
}

export async function listModels(key, fetchImpl = fetch) {
  const res = await fetchImpl(`${GEMINI}?pageSize=200`, {headers: {'x-goog-api-key': key}});
  if (!res.ok) throw await readError(res, 'Gemini (lista)');
  const body = await res.json();
  return (body.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
}
