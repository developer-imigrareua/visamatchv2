const express = require('express');
const router = express.Router();
const { extractLinkedIn } = require('../services/brightdata');

// POST /linkedin/extract
router.post('/extract', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('linkedin.com')) {
    return res.status(400).json({ error: 'URL do LinkedIn inválida.' });
  }

  try {
    const profile = await extractLinkedIn(url);
    res.json({ success: true, profile });
  } catch (err) {
    console.error('LinkedIn extraction error:', err.message);
    // Se falhar, retorna perfil vazio — conversa continua sem LinkedIn
    res.json({ success: false, profile: null, error: err.message });
  }
});

module.exports = router;
