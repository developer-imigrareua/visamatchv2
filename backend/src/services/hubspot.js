const axios = require('axios');
const supabase = require('../lib/supabase');

const BASE = 'https://api.hubapi.com';

function buildNoteText(lead) {
  const a = lead.analysis;
  if (!a) return 'Análise V2 — dados incompletos.';

  const lines = [
    `=== VisaMatch V2 — Análise de Perfil ===`,
    `Visto Recomendado: ${a.visto_recomendado}`,
    `Score: ${a.score}`,
    `Classificação: ${a.label}`,
    ``,
    `--- Resultados por Visto ---`,
    ...(a.vistos || []).map(v => `${v.visto}: score ${v.score} (${v.label})`),
    ``,
    `--- Perfil Coletado ---`,
    ...Object.entries(a.profile || {}).map(([k, v]) => `${k}: ${v}`),
  ];

  if (lead.utm && Object.keys(lead.utm).some(k => lead.utm[k])) {
    lines.push(``, `--- UTM ---`);
    Object.entries(lead.utm).forEach(([k, v]) => v && lines.push(`${k}: ${v}`));
  }

  return lines.join('\n');
}

async function syncToHubSpot(lead) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error('HUBSPOT_TOKEN não configurado.');

  try {
    // Busca contato existente por email
    const searchRes = await axios.post(`${BASE}/crm/v3/objects/contacts/search`, {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: lead.email }] }],
      properties: ['email', 'hs_object_id'],
    }, { headers: { Authorization: `Bearer ${token}` } });

    const existing = searchRes.data.results?.[0];
    let contactId;

    const contactProps = {
      email: lead.email,
      firstname: lead.nome?.split(' ')[0] || '',
      lastname: lead.nome?.split(' ').slice(1).join(' ') || '',
      phone: lead.phone || '',
      visamatch_v2_visto: lead.visto_recomendado || '',
      visamatch_v2_score: String(lead.score || ''),
      visamatch_v2_label: lead.label || '',
    };

    if (existing) {
      await axios.patch(`${BASE}/crm/v3/objects/contacts/${existing.id}`, { properties: contactProps },
        { headers: { Authorization: `Bearer ${token}` } });
      contactId = existing.id;
    } else {
      const createRes = await axios.post(`${BASE}/crm/v3/objects/contacts`, { properties: contactProps },
        { headers: { Authorization: `Bearer ${token}` } });
      contactId = createRes.data.id;
    }

    // Adiciona nota com análise completa em campo de texto único
    const noteText = buildNoteText(lead);
    await axios.post(`${BASE}/crm/v3/objects/notes`, {
      properties: {
        hs_note_body: noteText,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
      }],
    }, { headers: { Authorization: `Bearer ${token}` } });

    await supabase.from('leads_v2').update({
      hubspot_synced: true, hubspot_error: null,
    }).eq('id', lead.id);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await supabase.from('leads_v2').update({
      hubspot_synced: false, hubspot_error: msg,
    }).eq('id', lead.id);
    throw err;
  }
}

module.exports = { syncToHubSpot };
