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
- Se a resposta depende de algo fora dessas fontes (mercado, notícias, empresas de fora da base, conceitos que não estão no glossário): tipo "fora_da_base". Em "texto", diga em uma frase que isso não está na base de dados do CITi e pergunte se pode pesquisar na internet. Em "busca", escreva uma consulta curta para a pesquisa.
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
        consulta: {type: 'STRING'},
        busca: {type: 'STRING'}
      },
      required: ['tipo', 'texto']
    }
  },
  web: {
    grounded: true,
    prompt: i => `Pesquise na internet e responda em até 5 frases, para um time comercial de uma empresa júnior de tecnologia em Pernambuco: ${i.pergunta}
Diga quando a informação pode estar desatualizada.`
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

export async function runTask(task, input, {key, model, fetchImpl = fetch} = {}) {
  const t = TASKS[task];
  if (!t) throw Object.assign(new Error('Tarefa desconhecida'), {status: 400});
  const gen = {temperature: 0.3, maxOutputTokens: 2048};
  if (/2\.5-flash/.test(model)) gen.thinkingConfig = {thinkingBudget: 0};
  const request = t.grounded
    ? {systemInstruction: {parts: [{text: RULES}]}, contents: [{role: 'user', parts: [{text: t.prompt(input)}]}], tools: [{google_search: {}}], generationConfig: gen}
    : {systemInstruction: {parts: [{text: RULES + JSON_ONLY}]}, contents: [{role: 'user', parts: [{text: t.prompt(input)}]}], generationConfig: {...gen, responseMimeType: 'application/json', responseSchema: t.schema}};
  const res = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify(request)
  });
  if (!res.ok) {
    const detail = await res.text().then(t => { try { return JSON.parse(t).error?.message || t; } catch { return t; } }).catch(() => '');
    throw Object.assign(new Error(`Gemini respondeu ${res.status}: ${String(detail).slice(0, 240)}`), {status: res.status === 429 ? 429 : 502});
  }
  const body = await res.json();
  const cand = body?.candidates?.[0];
  const raw = (cand?.content?.parts || []).map(p => p.text || '').join('');
  if (!raw) throw Object.assign(new Error(`Resposta vazia do Gemini (${cand?.finishReason || 'sem motivo'})`), {status: 502});
  if (t.grounded) {
    const fontes = (cand.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean).map(w => ({uri: w.uri, title: w.title}));
    return {ok: true, data: {texto: raw.trim(), fontes}};
  }
  const data = JSON.parse(raw);
  const bad = unknownNumbers(data, input);
  return bad.length ? {ok: false, reason: 'numeros', bad} : {ok: true, data};
}
