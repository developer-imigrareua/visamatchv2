// Mesma lógica de scoring do V1 — fonte única de verdade
function calcScore(visto, p) {
  let s = 0;

  if (visto === 'EB-2 NIW') {
    const grauMap = {
      'Doutorado': 40, 'Mestrado': 35,
      'Bacharelado/Licenciatura concluído há mais de 5 anos': 20,
      'Bacharelado/Licenciatura concluído há menos de 5 anos': -35,
      'Tecnólogo com mais de 10 anos de experiência': 15,
      'Tecnólogo com menos de 10 anos de experiência': 0,
      'Superior incompleto com mais de 10 anos': -15,
      'Superior incompleto com menos de 10 anos': -30,
      'Sem formação acadêmica, mas com 10 anos de experiência': -30,
      'Sem formação acadêmica e sem 10 anos de experiência': -50,
    };
    s += grauMap[p.grauFormacao] || 0;
    ['niw_cartas','niw_palestras','niw_bancas','niw_reportagens','niw_artigos',
     'niw_pesquisa','niw_premios','niw_cursos','niw_licencas'].forEach(k => {
      if (p[k] === 'Sim') s += 3;
    });
    ['hab_diploma','hab_10anos','hab_licenca','hab_salario','hab_associacao','hab_reconhecimento'].forEach(k => {
      if (p[k]) s += 3;
    });
    const profBonus = ['Engenheiro','Médico','Dentista','Veterinário','Advogado','Desenvolvedor','TI','Piloto','Analista'];
    const profMinus = ['Arquiteto','Enfermeiro'];
    if (p.profissao && profBonus.some(x => p.profissao.includes(x))) s += 5;
    if (p.profissao && profMinus.some(x => p.profissao.includes(x))) s -= 5;
    const fundosMap = {
      'Sim, tenho os fundos': 40, 'Sim, mas prefiro parcelar': 30,
      'Talvez, preciso entender melhor': 20, 'Não tenho disponibilidade': -50,
    };
    s += fundosMap[p.fundos] || 0;
  }

  if (visto === 'EB-1A') {
    const keys = ['eb1_premios','eb1_assoc','eb1_midia','eb1_avaliador','eb1_contrib',
                  'eb1_lideranca','eb1_salario','eb1_artes','eb1_exposicoes','eb1_artigos'];
    keys.forEach(k => {
      if (p[k] === 'Sim') s += 10;
      else if (p[k] === 'Não possuo, mas posso obter') s += 3;
    });
    s = Math.min(100, s);
  }

  if (visto === 'O-1') {
    s += 10;
    const keys = ['o1_premios','o1_assoc','o1_midia','o1_avaliador','o1_contrib',
                  'o1_lideranca','o1_salario','o1_artes','o1_exposicoes','o1_artigos'];
    keys.forEach(k => {
      if (p[k] === 'Sim') s += 15;
      else if (p[k] === 'Não') s -= 10;
    });
  }

  if (visto === 'L-1') {
    s += 25;
    const posMap = {'Fundador / Empreendedor':25,'Sócio / Acionista':25,'Executivo / Gerente':25,'Funcionário com Conhecimento Especializado':15};
    s += posMap[p.posicao] || 0;
    const tamMap = {'Mais de 50 funcionários':25,'Entre 11 e 50 funcionários':10,'Entre 5 e 10 funcionários':-25,'Menos de 5 funcionários':-25};
    s += tamMap[p.numFunc] || 0;
    const fatMap = {'Acima de R$ 5 milhões/ano':25,'Entre R$ 2 e 5 milhões/ano':20,'Entre R$ 1 e 2 milhões/ano':15,'Menos de R$ 1 milhão/ano':-25};
    s += fatMap[p.faturamento] || 0;
  }

  if (visto === 'E-2') {
    s += p.tratado === 'Sim' ? 50 : -50;
    const invMap = {'Acima de US$ 100 mil':40,'Entre US$ 51k e US$ 100k':25,'Entre US$ 26k e US$ 50k':10,'Menos de US$ 25k':5,'Sem previsão de investimento':-25};
    s += invMap[p.investimento] || 0;
    if (p.tratado === 'Sim') s += 10;
  }

  if (visto === 'Family Based' || visto === 'H-1B') s = 80;

  return Math.max(-100, Math.min(100, s));
}

function getClass(score, visto) {
  if (visto === 'EB-1A') {
    if (score >= 50) return { label: 'Perfil Forte', partner: 'liv' };
    if (score >= 30) return { label: 'Perfil Moderado', partner: 'liv' };
    if (score >= 10) return { label: 'Perfil em Desenvolvimento', partner: 'phoenix' };
    return { label: 'Perfil Incompatível', partner: 'phoenix' };
  }
  if (score >= 70) return { label: 'Perfil Forte', partner: 'liv' };
  if (score >= 40) return { label: 'Perfil Moderado', partner: 'liv' };
  if (score >= 0)  return { label: 'Perfil em Desenvolvimento', partner: 'phoenix' };
  return { label: 'Perfil Incompatível', partner: 'phoenix' };
}

// Critérios do V1 por visto — usados pelos agentes para saber o que coletar
const VISA_CRITERIA = {
  'EB-2 NIW': {
    fields: ['grauFormacao','niw_cartas','niw_artigos','niw_premios','niw_pesquisa',
             'niw_licencas','niw_palestras','niw_bancas','niw_reportagens','niw_cursos',
             'hab_diploma','hab_licenca','hab_salario','hab_associacao','hab_reconhecimento',
             'profissao','fundos'],
    questions: {
      niw_cartas: 'Você tem ou conseguiria cartas de recomendação de pessoas com relevância na sua área?',
      niw_artigos: 'Você já publicou artigos de sua autoria em revistas científicas ou na mídia?',
      niw_premios: 'Tem comprovação de premiações ou reconhecimentos pelo seu trabalho?',
      niw_pesquisa: 'Já teve participação em projetos de pesquisa na sua área?',
      niw_licencas: 'Possui licenças emitidas por Conselhos Profissionais ou certificações reconhecidas?',
      niw_palestras: 'Tem certificados de palestras ministradas ou participação na organização de eventos?',
      niw_bancas: 'Tem comprovação de participação como avaliador em bancas acadêmicas ou profissionais?',
      niw_reportagens: 'Possui comprovação de reportagens ou entrevistas em que foi citado como fonte?',
      niw_cursos: 'Possui certificados de cursos e treinamentos na sua área?',
      fundos: 'Você tem fundos disponíveis para o processo imigratório?',
    }
  },
  'EB-1A': {
    fields: ['eb1_premios','eb1_assoc','eb1_midia','eb1_avaliador','eb1_contrib',
             'eb1_lideranca','eb1_salario','eb1_artes','eb1_exposicoes','eb1_artigos'],
    questions: {
      eb1_premios: 'Você já recebeu prêmios de excelência reconhecidos nacional ou internacionalmente?',
      eb1_assoc: 'Participa de associações que exigem realizações de destaque para admissão?',
      eb1_midia: 'Já foram publicadas reportagens sobre você em revistas ou mídias de grande alcance?',
      eb1_avaliador: 'Você já foi convidado a avaliar o trabalho de outras pessoas profissionalmente?',
      eb1_contrib: 'Tem evidências de contribuições originais de grande importância para o seu campo?',
      eb1_lideranca: 'Já ocupou cargos de liderança ou papel crítico em alguma organização importante?',
      eb1_salario: 'Seu salário está comprovadamente acima da média dos profissionais da sua área?',
      eb1_artes: 'Você já teve sucesso comercial comprovado em artes performáticas?',
      eb1_exposicoes: 'Seu trabalho já foi exibido em exposições ou mostras importantes?',
      eb1_artigos: 'Você é autor de artigos acadêmicos publicados em revistas reconhecidas?',
    }
  },
  'O-1': {
    fields: ['o1_premios','o1_assoc','o1_midia','o1_avaliador','o1_contrib',
             'o1_lideranca','o1_salario','o1_artes','o1_exposicoes','o1_artigos'],
    questions: {
      o1_premios: 'Você já recebeu prêmios ou reconhecimentos nacionais/internacionais na sua área?',
      o1_midia: 'Existem publicações em mídia relevante sobre você ou seu trabalho?',
      o1_contrib: 'Você possui contribuições originais reconhecidas na sua área?',
      o1_lideranca: 'Você ocupa ou já ocupou um papel de liderança em organizações de destaque?',
      o1_salario: 'Sua remuneração está acima da média da sua área?',
      o1_assoc: 'Você participa de associações que exigem realizações de destaque para admissão?',
      o1_avaliador: 'Você já foi convidado a avaliar o trabalho de outros profissionais da sua área?',
      o1_artigos: 'Você é autor de artigos acadêmicos publicados em revistas profissionais?',
    }
  },
};

module.exports = { calcScore, getClass, VISA_CRITERIA };
