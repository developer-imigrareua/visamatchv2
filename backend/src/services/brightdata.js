const axios = require('axios');

const API_KEY = process.env.BRIGHTDATA_API_KEY;
const DATASET_ID = process.env.BRIGHTDATA_DATASET_ID || 'gd_l1viktl72bvl7bjuj0';

async function extractLinkedIn(linkedinUrl) {
  if (!API_KEY) throw new Error('BRIGHTDATA_API_KEY não configurado.');

  // 1. Trigger snapshot
  const triggerRes = await axios.post(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&include_errors=true`,
    [{ url: linkedinUrl }],
    { headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' } }
  );

  const snapshotId = triggerRes.data?.snapshot_id;
  if (!snapshotId) throw new Error('Bright Data não retornou snapshot_id.');

  // 2. Poll until ready (max 30s)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await axios.get(
      `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    if (statusRes.data?.status === 'ready' || Array.isArray(statusRes.data)) {
      const raw = Array.isArray(statusRes.data) ? statusRes.data[0] : statusRes.data;
      return parseLinkedInProfile(raw);
    }
  }
  throw new Error('Timeout ao aguardar dados do LinkedIn.');
}

function parseLinkedInProfile(raw) {
  if (!raw) return {};
  return {
    nome: raw.name || (raw.first_name ? `${raw.first_name || ''} ${raw.last_name || ''}`.trim() : null),
    titulo: raw.headline || null,
    localizacao: raw.location || raw.city || null,
    resumo: raw.about || raw.summary || null,
    foto: raw.avatar || raw.profile_image_url || raw.photo_url || null,
    conexoes: raw.connections || raw.followers || null,
    formacao: (raw.education || []).map(e => ({
      instituicao: e.title || e.school || e.institution,
      curso: e.field_of_study || e.degree_name || null,
      grau: e.degree_name || null,
      inicio: e.start_year || e.start_date,
      fim: e.end_year || e.end_date,
    })),
    experiencia: (raw.experience || []).map(e => ({
      empresa: e.company || e.company_name,
      cargo: e.title,
      inicio: e.start_date,
      fim: e.end_date,
      descricao: e.description,
    })),
    empresa_atual: raw.current_company?.name || null,
    cargo_atual: raw.position || null,
    publicacoes: raw.posts || raw.publications || [],
    premios: raw.honors_and_awards ? [raw.honors_and_awards] : (raw.awards || []),
    certificacoes: (raw.courses || raw.certifications || []).map(c => c.title || c.name || c),
    habilidades: (raw.skills || []).map(s => s.name || s),
    idiomas: (raw.languages || []).map(l => l.title || l.name || l),
    url: raw.url || raw.linkedin_url || raw.input_url || null,
  };
}

module.exports = { extractLinkedIn };
