const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { chat, startInterview, determineVisaPath } = require('../agents/interviewer');
const { calcScore, getClass } = require('../agents/scoring');

// POST /chat/start — inicia ou retoma sessão de chat
router.post('/start', async (req, res) => {
  const { session_id, nome, email, phone, linkedin_profile } = req.body;
  if (!session_id || !nome || !email) {
    return res.status(400).json({ error: 'session_id, nome e email são obrigatórios.' });
  }

  // Salva/atualiza sessão no Supabase
  await supabase.from('sessions_v2').upsert({
    session_id, nome, email, phone: phone || null,
    linkedin_profile: linkedin_profile || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'session_id' });

  const visaPath = linkedin_profile ? determineVisaPath(linkedin_profile) : ['EB-2 NIW', 'O-1'];
  const firstMsg = await startInterview(linkedin_profile, nome, visaPath);

  // Salva primeira mensagem do agente
  await supabase.from('messages_v2').insert({
    session_id, role: 'assistant', content: firstMsg.text,
  });

  res.json({ message: firstMsg.text, visa_path: visaPath });
});

// POST /chat/message — envia mensagem do usuário e recebe resposta
router.post('/message', async (req, res) => {
  const { session_id, content } = req.body;
  if (!session_id || !content) {
    return res.status(400).json({ error: 'session_id e content são obrigatórios.' });
  }

  // Busca sessão
  const { data: session } = await supabase.from('sessions_v2')
    .select('*').eq('session_id', session_id).single();
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });

  // Salva mensagem do usuário
  await supabase.from('messages_v2').insert({ session_id, role: 'user', content });

  // Carrega histórico completo
  const { data: history } = await supabase.from('messages_v2')
    .select('role, content').eq('session_id', session_id)
    .order('created_at', { ascending: true });

  const visaPath = session.linkedin_profile
    ? determineVisaPath(session.linkedin_profile)
    : ['EB-2 NIW', 'O-1'];

  const collected = session.collected_profile || {};

  try {
    const result = await chat(history, session.linkedin_profile, collected, visaPath);

    // Merge dados extraídos no perfil coletado
    const updatedProfile = { ...collected, ...result.extractedData };

    // Salva resposta do agente
    await supabase.from('messages_v2').insert({
      session_id, role: 'assistant', content: result.text,
    });

    // Atualiza perfil coletado na sessão
    await supabase.from('sessions_v2').update({
      collected_profile: updatedProfile,
      updated_at: new Date().toISOString(),
    }).eq('session_id', session_id);

    let analysis = null;
    if (result.isReady) {
      analysis = computeAnalysis(visaPath, updatedProfile, session);
      await supabase.from('sessions_v2').update({
        analysis, status: 'completed',
        updated_at: new Date().toISOString(),
      }).eq('session_id', session_id);
    }

    res.json({ message: result.text, analysis, is_ready: result.isReady });
  } catch (err) {
    console.error('Chat agent error:', err);
    res.status(500).json({ error: 'Erro ao processar mensagem.' });
  }
});

function computeAnalysis(visaPath, profile, session) {
  const results = visaPath.map(visto => {
    const score = calcScore(visto, profile);
    const cls = getClass(score, visto);
    return { visto, score, ...cls };
  }).sort((a, b) => b.score - a.score);

  const best = results[0];
  return {
    vistos: results,
    visto_recomendado: best.visto,
    score: best.score,
    label: best.label,
    partner: best.partner,
    profile,
    linkedin_foto: session.linkedin_profile?.foto || null,
    linkedin_nome: session.linkedin_profile?.nome || null,
    linkedin_titulo: session.linkedin_profile?.titulo || null,
  };
}

module.exports = router;
