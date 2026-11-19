# ELO — Estratégia, Leads e Oportunidades

Plataforma do Comercial do CITi para decidir **quem contatar, quando e com que argumento**, e aprender com cada resultado. Projeto do Desafio de Inovação do processo seletivo 2026.2.

> Todos os dados da demonstração (pessoas, empresas, leads, clientes e metas) são fictícios.

## O ciclo

1. **ICP vivo**: o perfil de cliente ideal é recalculado a partir dos resultados do funil e aprovado pela Diretoria.
2. **Prospecção**: o CITi.AI avalia cada empresa em quatro dimensões (Fit, Momento, Acesso e Histórico) e diz se vale contatar agora, esperar ou descartar.
3. **Prospect Day**: a fila do dia, ordenada por temperatura, com o dossiê ao lado e o resultado registrado em um clique.
4. **Pipeline**: os leads passam pelas etapas do ciclo de venda, e toda perda exige um motivo.
5. **Análise**: o painel de métricas responde onde o funil perde e que perfil avança, e esses dados alimentam o próximo ICP.

## Telas

| Tela | O que faz |
| --- | --- |
| Entrada | Seletor de perfil (Diretoria, Gerência Comercial e Gerência de Contas) e a animação dos lemas do CITi |
| Início | Resumo do dia, atalhos para os módulos, pulso do Comercial e atividade recente |
| Prospect Day | Fila do dia, dossiê, confirmação de cada ligação com comentário e resumo do dia |
| Pipeline | Quadro com as etapas do ciclo de venda, detalhe do lead, equipe e globo de clientes |
| CITi.AI | Modo ICP (gerar, comparar, aprovar e versionar; métricas personalizadas) e modo Prospecção (temperatura e dossiê) |
| Análise | Métricas essenciais, perguntas ao CITi.AI, planilha CSV ou XLSX com mapeamento de colunas e métricas fixadas |

## Como a IA é usada

O sistema calcula e a IA interpreta. Toda conta é feita em código, e a IA recebe só os números já calculados. O Groq responde primeiro; se ele falhar ou bater no limite, o Gemini Flash-Lite assume.

- **Checagem dupla de números.** O servidor e o navegador conferem se cada número que a IA escreveu existe nos dados enviados. Se algum não existir, o texto é descartado e a tela mostra a versão padrão com um aviso.
- **Veredito antes de calcular.** Para uma métrica personalizada, o agente diz se pode entregar, se pode entregar com ressalvas (amostra pequena ou dado aproximado) ou se não pode (coluna inexistente), e pede confirmação antes de calcular.
- **Uma pessoa sempre decide.** A IA propõe o ICP, mas só a Diretoria publica. O agente recomenda contatar ou não, mas quem liga é sempre uma pessoa.
- **Modo demonstração.** Sem chave configurada, se as cotas acabarem ou se a IA demorar demais, o ELO usa textos padrão montados a partir dos mesmos números. Depois de uma demora, o ELO para de chamar o Gemini até a página ser recarregada, para ninguém esperar de novo. A demonstração nunca para.

Onde a IA entra: conversa livre com o CITi.AI, leitura das análises, resumo da proposta de ICP, abertura da ligação e perguntas SPIN do dossiê.

- **Conversa livre.** O CITi.AI responde dúvidas sobre conceitos do Comercial, usando um glossário tirado do treinamento comercial, sobre como usar o ELO e sobre os dados do funil. Pedidos de ação, como avaliar uma empresa, gerar o ICP ou calcular uma métrica, abrem o fluxo certo.
- **Fora da base, sem inventar.** Quando a resposta não está nos dados do CITi, no glossário ou no guia do ELO, o agente avisa que nesta versão não faz pesquisa online. Ele não completa a resposta com conhecimento geral do modelo.

## Estrutura

```
index.html          interface completa (HTML, CSS e JS)
assets/             logo e elementos visuais dos slides do CITi
api/ai.js           rota que chama a IA (POST /api/ai)
api/health.js       status da integração (GET /api/health)
lib/ia.js           prompts, chamada ao Groq e ao Gemini e checagem de números
tests/              testes da checagem de números
```

## Rodar e publicar

**Só a interface:** abra o `index.html` no navegador. Ela funciona no modo demonstração.

**Com a IA, na Vercel:**

1. Importe o repositório em vercel.com (*Add New › Project*). Não precisa configurar framework nem build.
2. Em *Settings › Environment Variables*, crie `GROQ_API_KEY` (chave grátis em console.groq.com) e, como reserva, `GEMINI_API_KEY` (Google AI Studio). `GROQ_MODEL` e `GEMINI_MODEL` são opcionais: os padrões são `openai/gpt-oss-120b,llama-3.3-70b-versatile` e `gemini-3.5-flash-lite,gemini-3.1-flash-lite`.
3. Faça o deploy. Em `/api/health`, o campo `"ia": true` confirma que a chave foi lida. `/api/health?teste=texto` faz uma chamada real e mostra quem respondeu e em quanto tempo, e `/api/health?teste=modelos` lista os modelos que a chave do Gemini pode usar. A ordem de tentativa aparece no campo `ordem`.

A chave fica só no servidor e nunca chega ao navegador.

**Localmente, com a IA:** copie `.env.example` para `.env`, preencha as chaves e rode `npx vercel dev`.

**Testes:** `npm test`.

## Limites conhecidos e próximos passos

- Os dados ficam no navegador de quem usa (localStorage). Em produção, iriam para um banco compartilhado pelo time.
- O login é um seletor de perfil. Em produção, seria autenticação com as contas do CITi.
- A tradução de pedidos de métrica em linguagem natural é feita por regras. O próximo passo é passar essa tradução para a IA, com a mesma validação em código.
- **Pesquisa online é o próximo objetivo.** A ideia é o agente perguntar "posso pesquisar na internet?" quando a resposta não estiver na base, e só pesquisar depois do sim, mostrando as fontes. Testamos isso com o Gemini e a pesquisa do Google, mas o plano gratuito da API recusou a chamada por cota (erro 429). Por isso, nesta versão, o agente só avisa que não faz pesquisa online.
- Empresas, gatilhos e histórico do funil vêm de uma base fictícia dentro do próprio ELO. Em produção, os gatilhos viriam de fontes públicas (notícias, Receita Federal, LinkedIn) e o histórico, do funil real do Comercial.
