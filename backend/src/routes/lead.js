const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { syncToHubSpot } = require('../services/hubspot');

// POST /lead/partial — salva parcial durante a conversa
router.post('/partial', async (req, res) => {
  const { session_id, nome, email, phone } = req.body;
  if (!email) return res.status(400).json({ error: 'email obrigatório.' });

  const { error } = await supabase.from('leads_v2').upsert({
    session_id, nome, email, phone: phone || null,
    hubspot_synced: false, updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /lead/complete — salva lead completo com análise
router.post('/complete', async (req, res) => {
  const { session_id, nome, email, phone, analysis, utm } = req.body;
  if (!email || !analysis) return res.status(400).json({ error: 'email e analysis são obrigatórios.' });

  const payload = {
    session_id, nome, email, phone: phone || null,
    visto_recomendado: analysis.visto_recomendado,
    score: analysis.score,
    label: analysis.label,
    partner: analysis.partner,
    analysis,
    utm: utm || null,
    hubspot_synced: false,
    hubspot_error: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('leads_v2').upsert(payload, { onConflict: 'email' }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Tenta sync HubSpot de forma assíncrona (não bloqueia resposta)
  syncToHubSpot(data).catch(e => console.error('HubSpot sync error:', e.message));

  res.json({ success: true, lead: data });
});

module.exports = router;
