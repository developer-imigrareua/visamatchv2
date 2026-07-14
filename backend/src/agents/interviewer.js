const Anthropic = require('@anthropic-ai/sdk');
const { VISA_CRITERIA, calcScore, getClass } = require('./scoring');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Determina quais vistos investigar com base no perfil do LinkedIn
function determineVisaPath(linkedinProfile) {
  const vistos = [];
  const f = linkedinProfile;

  // Sempre avalia NIW e EB-1A/O-1 para profissionais
  if (f.experiencia?.length > 0 || f.formacao?.length > 0) {
    vistos.push('EB-2 NIW', 'EB-1A', 'O-1');
  }
  // L-1 se tem experiência em empresa
  if (f.experiencia?.some(e => e.empresa)) vistos.push('L-1');

  return vistos.length > 0 ? vistos : ['EB-2 NIW', 'O-1'];
}

// Identifica quais campos ainda faltam no perfil para calcular o score
function getMissingFields(visto, profile) {
  const criteria = VISA_CRITERIA[visto];
  if (!criteria) return [];
  return criteria.fields.filter(field => profile[field] === undefined || profile[field] === null);
}

// System prompt do agente entrevistador
function buildSystemPrompt(linkedinProfile, collectedProfile, visaPath) {
  const linkedinSummary = linkedinProfile ? `
PERFIL LINKEDIN EXTRAÍDO:
- Nome: ${linkedinProfile.nome || 'não informado'}
- Título: ${linkedinProfile.titulo || 'não informado'}
- Localização: ${linkedinProfile.localizacao || 'não informado'}
- Conexões: ${linkedinProfile.conexoes || 'não informado'}
- Resumo: ${linkedinProfile.resumo ? linkedinProfile.resumo.slice(0, 300) : 'não informado'}
- Formação: ${linkedinProfile.formacao?.map(f => `${f.grau} em ${f.curso} (${f.instituicao})`).join('; ') || 'não encontrada'}
- Experiência: ${linkedinProfile.experiencia?.slice(0,5).map(e => `${e.cargo} na ${e.empresa} (${e.inicio||'?'} – ${e.fim||'atual'})`).join('; ') || 'não encontrada'}
- Publicações: ${linkedinProfile.publicacoes?.length || 0}
- Prêmios/Honrarias: ${linkedinProfile.premios?.length || 0}
- Certificações: ${linkedinProfile.certificacoes?.map(c => c.name || c).join(', ') || 'nenhuma'}
- Habilidades: ${linkedinProfile.habilidades?.slice(0,10).join(', ') || 'não informado'}
- Idiomas: ${linkedinProfile.idiomas?.join(', ') || 'não informado'}
` : 'Perfil LinkedIn não disponível.';

  const missingByVisa = visaPath.map(v => {
    const missing = getMissingFields(v, collectedProfile);
    return `${v}: ${missing.length} campos em aberto`;
  }).join('\n');

  return `Você é um especialista em imigração americana da ImigrarEUA, conduzindo uma análise de perfil para visto americano.

${linkedinSummary}

VISTOS EM ANÁLISE: ${visaPath.join(', ')}

CAMPOS AINDA NECESSÁRIOS:
${missingByVisa}

DADOS JÁ COLETADOS:
${JSON.stringify(collectedProfile, null, 2)}

INSTRUÇÕES:
1. Converse de forma natural e amigável em português brasileiro
2. Faça UMA pergunta por vez — nunca várias de uma vez
3. Use o LinkedIn como contexto — não repita o que já sabe
4. Adapte as perguntas ao perfil: se viu publicações no LinkedIn, confirme em vez de perguntar do zero
5. Se o usuário responder "não" para algo, aceite e siga em frente
6. Quando tiver dados suficientes para calcular score em pelo menos um visto, sinalize com [ANALYSIS_READY] no final da mensagem
7. Sempre que extrair uma informação da resposta, inclua no final da sua mensagem o JSON dos campos coletados assim:
   [DATA: {"campo": "valor"}]
8. Nunca mencione IA, algoritmo ou que está "calculando" — seja natural
9. Máximo 12 perguntas no total antes de concluir
10. Não use "elegibilidade" — use "perfil" ou "pré-elegibilidade"`;
}

async function chat(messages, linkedinProfile, collectedProfile, visaPath) {
  const systemPrompt = buildSystemPrompt(linkedinProfile, collectedProfile, visaPath || ['EB-2 NIW', 'O-1']);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });

  const text = response.content[0]?.text || '';

  // Extrai dados coletados do JSON embutido na resposta
  const dataMatch = text.match(/\[DATA:\s*(\{[\s\S]*?\})\]/);
  let extractedData = {};
  if (dataMatch) {
    try { extractedData = JSON.parse(dataMatch[1]); } catch(_) {}
  }

  const isReady = text.includes('[ANALYSIS_READY]');

  // Limpa marcadores técnicos da mensagem antes de enviar ao usuário
  const cleanText = text
    .replace(/\[DATA:[\s\S]*?\]/g, '')
    .replace(/\[ANALYSIS_READY\]/g, '')
    .trim();

  return { text: cleanText, extractedData, isReady };
}

// Mensagem inicial do agente após coletar contato
async function startInterview(linkedinProfile, nome, visaPath) {
  const hasLinkedin = !!linkedinProfile?.nome;

  if (hasLinkedin) {
    const formacao = linkedinProfile.formacao?.[0];
    const exp = linkedinProfile.experiencia?.[0];
    return {
      text: `Ótimo, ${nome}! Analisei seu LinkedIn e vi que você ${exp ? `é ${exp.cargo} na ${exp.empresa}` : 'tem uma trajetória interessante'}${formacao ? ` com formação em ${formacao.curso || formacao.grau}` : ''}.\n\nPara completar sua análise de perfil para os EUA, vou fazer algumas perguntas rápidas. Vamos começar?\n\nVocê já teve alguma publicação na mídia — reportagem, entrevista ou artigo mencionando você ou seu trabalho?`,
      extractedData: {},
      isReady: false,
    };
  }

  return {
    text: `Perfeito, ${nome}! Para analisar seu perfil de imigração para os EUA, vou precisar de algumas informações sobre sua trajetória profissional.\n\nQual é a sua profissão ou área de atuação principal?`,
    extractedData: {},
    isReady: false,
  };
}

module.exports = { chat, startInterview, determineVisaPath, getMissingFields };
