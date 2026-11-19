const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const RULES = `Você é o CITi.AI, agente de estratégia do Comercial do CITi, empresa júnior de tecnologia do CIn-UFPE.
Regras que nunca podem ser quebradas:
- Use apenas os números que aparecem nos dados recebidos. Não calcule, não arredonde de outro jeito e não invente números.
- Se os dados não sustentam uma conclusão, diga isso em vez de supor.
- Escreva em português do Brasil, frases curtas, tom direto e humano, sem jargão de IA.
- Responda somente com o JSON pedido.`;

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
  const res = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({
      systemInstruction: {parts: [{text: RULES}]},
      contents: [{role: 'user', parts: [{text: t.prompt(input)}]}],
      generationConfig: {temperature: 0.3, maxOutputTokens: 900, responseMimeType: 'application/json', responseSchema: t.schema}
    })
  });
  if (!res.ok) throw Object.assign(new Error(`Gemini respondeu ${res.status}`), {status: res.status === 429 ? 429 : 502});
  const body = await res.json();
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw Object.assign(new Error('Resposta vazia do Gemini'), {status: 502});
  const data = JSON.parse(raw);
  const bad = unknownNumbers(data, input);
  return bad.length ? {ok: false, reason: 'numeros', bad} : {ok: true, data};
}
