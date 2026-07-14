const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { syncToHubSpot } = require('../services/hubspot');

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token obrigatório.' });
  try {
    jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

// POST /admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  const token = jwt.sign({ admin: true }, process.env.ADMIN_JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// GET /admin/leads
router.get('/leads', auth, async (req, res) => {
  const { page = 1, limit = 50, q } = req.query;
  const from = (page - 1) * limit;

  let query = supabase.from('leads_v2').select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (q) query = query.or(`email.ilike.%${q}%,nome.ilike.%${q}%`);

  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ leads: data, total: count });
});

// GET /admin/leads/:id
router.get('/leads/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('leads_v2')
    .select('*, sessions_v2(*)').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Lead não encontrado.' });
  res.json(data);
});

// POST /admin/leads/:id/hubspot-sync
router.post('/leads/:id/hubspot-sync', auth, async (req, res) => {
  const { data: lead } = await supabase.from('leads_v2').select('*').eq('id', req.params.id).single();
  if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
  try {
    await syncToHubSpot(lead);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/hubspot-logs
router.get('/hubspot-logs', auth, async (req, res) => {
  const { data, error } = await supabase.from('leads_v2')
    .select('id, nome, email, visto_recomendado, score, hubspot_synced, hubspot_error, created_at')
    .eq('hubspot_synced', false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logs: data });
});

// GET /admin/stats
router.get('/stats', auth, async (req, res) => {
  const { count: total } = await supabase.from('leads_v2').select('id', { count: 'exact', head: true });
  const { count: completed } = await supabase.from('leads_v2')
    .select('id', { count: 'exact', head: true }).not('score', 'is', null);
  const { count: synced } = await supabase.from('leads_v2')
    .select('id', { count: 'exact', head: true }).eq('hubspot_synced', true);
  res.json({ total, completed, synced });
});

module.exports = router;
