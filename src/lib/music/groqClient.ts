// @ts-nocheck
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const REQUEST_TIMEOUT_MS = 25_000;

function isGroqConfigured() {
  return !!process.env.GROQ_API_KEY;
}

const MAX_SONGS = 25;
const AUTO_MAX_SONGS = 15;

function buildSystemPrompt(count) {
  const lines = [
    'Tu es un expert musical. On te donne une demande qui peut être un simple mot-clé,',
    "une phrase, ou un paragraphe entier décrivant une envie, une humeur, une situation,",
    "une activité, une époque, une langue, un artiste ou un style. Comprends l'intention réelle.",
    '',
    "Décide du MODE :",
    "- \"single\" : l'utilisateur veut clairement UN seul morceau précis (ex: \"joue Daddy Yankee Gasolina\", \"mets moi la chanson X\").",
    "- \"playlist\" : l'utilisateur décrit une ambiance, un style, un artiste (plusieurs titres), une activité, ou demande explicitement plusieurs morceaux.",
    '',
  ];

  if (count) {
    lines.push(`L'utilisateur veut EXACTEMENT ${count} morceau(x). Mode = ${count === 1 ? '"single"' : '"playlist"'}.`);
  } else {
    lines.push(`Choisis toi-même le nombre : 1 en mode "single", sinon entre 8 et ${AUTO_MAX_SONGS} en mode "playlist".`);
  }

  lines.push(
    '',
    'Règles :',
    '- Morceaux réels et connus, susceptibles d\'exister sur YouTube.',
    '- Pas de doublons.',
    "- Pour un artiste précis : uniquement SES titres, variés et populaires.",
    "- Pour un style/une ambiance : varie les artistes.",
    '- Adapte-toi vraiment au texte (paragraphe, émotion, contexte).',
    '',
    'Réponds STRICTEMENT en JSON valide, sans texte autour, au format :',
    '{"name": "nom court", "mode": "single|playlist", "songs": [{"title": "titre", "artist": "artiste"}]}'
  );

  return lines.join('\n');
}

function normalizeSongs(parsed, count) {
  const rawSongs = Array.isArray(parsed?.songs) ? parsed.songs : [];
  const seen = new Set();
  const songs = [];
  const limit = count ? Math.min(count, MAX_SONGS) : MAX_SONGS;

  for (const item of rawSongs) {
    const title = (item?.title || '').toString().trim();
    const artist = (item?.artist || '').toString().trim();
    if (!title) continue;

    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    songs.push({ title, artist });
    if (songs.length >= limit) break;
  }

  return songs;
}

async function generatePlaylist(prompt, { count = null } = {}) {
  if (!isGroqConfigured()) {
    throw new Error('GROQ_API_KEY manquant dans .env — ajoute ta clé Groq pour utiliser /ia.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.85,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(count) },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Groq a mis trop de temps à répondre. Réessaie.');
    }
    throw new Error(`Connexion à Groq impossible : ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Clé Groq invalide (401). Vérifie GROQ_API_KEY dans .env.');
    }
    if (response.status === 429) {
      throw new Error('Limite Groq atteinte (429). Réessaie dans un instant.');
    }
    throw new Error(`Erreur Groq ${response.status} : ${detail.slice(0, 150)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Réponse Groq vide.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Groq a renvoyé un format inattendu. Réessaie.');
  }

  const songs = normalizeSongs(parsed, count);
  if (!songs.length) {
    throw new Error('Aucun morceau généré. Reformule ta demande.');
  }

  const mode = parsed?.mode === 'single' || songs.length === 1 ? 'single' : 'playlist';

  return {
    name: (parsed?.name || (mode === 'single' ? 'Titre IA' : 'Playlist IA')).toString().slice(0, 100),
    mode,
    songs,
  };
}

export {
  isGroqConfigured,
  generatePlaylist,
  DEFAULT_MODEL,
};
