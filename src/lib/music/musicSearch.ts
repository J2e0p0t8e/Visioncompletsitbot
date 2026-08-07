// @ts-nocheck
import playdl from "play-dl";
import { searchYoutube, getYoutubeMetadata  } from "./youtubeSearch.js";
import { suggestYoutubeTitles  } from "./youtubeSuggest.js";

const YT_SUGGEST_LIMIT = 5;
const SP_SUGGEST_LIMIT = 3;

function isSpotifyConfigured() {
  return !!(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REFRESH_TOKEN
  );
}

async function ensureSpotifyToken() {
  if (!isSpotifyConfigured()) return false;
  if (playdl.is_expired()) {
    await playdl.refreshToken();
  }
  return true;
}

function truncate(str, max = 100) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return 'Inconnue';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function youtubeWatchUrl(video) {
  const id = video.id || video.videoId;
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  return video.url;
}

function youtubeVideoToSong(video, requestedBy) {
  return {
    title: video.title,
    url: youtubeWatchUrl(video),
    videoId: video.id,
    duration: video.durationRaw || 'Inconnue',
    thumbnail: video.thumbnails?.[0]?.url,
    requestedBy,
    source: 'youtube',
  };
}

async function spotifyTrackToSong(track, requestedBy) {
  const artist = track.artists?.map((a) => a.name).join(' ') || '';
  const ytResults = await searchYoutube(`${track.name} ${artist}`, 1);
  if (!ytResults.length) {
    throw new Error(`Aucune correspondance YouTube pour "${track.name}"`);
  }

  const title = track.artists?.[0]?.name
    ? `${track.name} — ${track.artists[0].name}`
    : track.name;

  return {
    title,
    url: youtubeWatchUrl(ytResults[0]),
    videoId: ytResults[0].id,
    duration: track.durationInSec
      ? formatDuration(track.durationInSec)
      : ytResults[0].durationRaw || 'Inconnue',
    thumbnail: track.thumbnail?.url || ytResults[0].thumbnails?.[0]?.url,
    requestedBy,
    source: 'spotify',
    originalUrl: track.url,
  };
}

async function youtubeUrlToSong(url, requestedBy) {
  const meta = await getYoutubeMetadata(url);
  if (!meta) {
    throw new Error('Impossible de récupérer les infos de la vidéo YouTube');
  }
  return youtubeVideoToSong(meta, requestedBy);
}

async function youtubePlaylistToSongs(url, requestedBy) {
  const playlist = await playdl.playlist_info(url, { incomplete: true });
  const videos = await playlist.all_videos();
  return videos.map((video) => youtubeVideoToSong(video, requestedBy));
}

async function spotifyUrlToSong(url, requestedBy) {
  if (!isSpotifyConfigured()) {
    throw new Error('Spotify non configuré. Ajoute les clés Spotify dans ton .env');
  }
  await ensureSpotifyToken();
  const data = await playdl.spotify(url);
  if (data.type !== 'track') {
    throw new Error('URL Spotify invalide pour une piste unique');
  }
  return spotifyTrackToSong(data, requestedBy);
}

async function spotifyCollectionToSongs(url, requestedBy) {
  if (!isSpotifyConfigured()) {
    throw new Error('Spotify non configuré. Ajoute les clés Spotify dans ton .env');
  }
  await ensureSpotifyToken();
  const data = await playdl.spotify(url);
  await data.fetch();
  const tracks = await data.all_tracks();
  const songs = [];
  for (const track of tracks) {
    try {
      songs.push(await spotifyTrackToSong(track, requestedBy));
    } catch (err) {
      console.warn(`Spotify ignoré: ${track.name} — ${err.message}`);
    }
  }
  return songs;
}

import { getCachedSuggestions,
  setCachedSuggestions,
  withTimeout,
  AUTocomplete_TIMEOUT_MS,
 } from "./autocomplete.js";

async function searchSuggestions(query) {
  if (!query || query.length < 2) return [];

  const cached = getCachedSuggestions(query);
  if (cached) return cached;

  const ytTitlesPromise = suggestYoutubeTitles(query, YT_SUGGEST_LIMIT);

  const spPromise = isSpotifyConfigured()
    ? ensureSpotifyToken()
        .then(() => playdl.search(query, { source: { spotify: 'track' }, limit: SP_SUGGEST_LIMIT }))
        .catch(() => [])
    : Promise.resolve([]);

  const [ytTitles, spResults] = await withTimeout(
    Promise.all([ytTitlesPromise, spPromise]),
    AUTocomplete_TIMEOUT_MS
  );

  const choices = [];

  for (const title of ytTitles || []) {
    choices.push({
      name: truncate(`▶️ ${title}`),
      value: truncate(title, 100),
    });
  }

  for (const track of spResults || []) {
    const artist = track.artists?.[0]?.name || 'Spotify';
    choices.push({
      name: truncate(`🟢 ${track.name} — ${artist}`),
      value: `sp:${track.id}`,
    });
  }

  const result = choices.slice(0, 25);
  setCachedSuggestions(query, result);
  return result;
}

async function resolveQuery(query, requestedBy) {
  try {
    if (query.startsWith('yt:')) {
      const id = query.slice(3);
      const meta = await getYoutubeMetadata(id);
      if (meta) return [youtubeVideoToSong(meta, requestedBy)];
      return [await youtubeUrlToSong(`https://www.youtube.com/watch?v=${id}`, requestedBy)];
    }

    if (query.startsWith('sp:')) {
      const id = query.slice(3);
      return [await spotifyUrlToSong(`https://open.spotify.com/track/${id}`, requestedBy)];
    }

    if (query.startsWith('http')) {
      const ytType = playdl.yt_validate(query);
      if (ytType === 'video') return [await youtubeUrlToSong(query, requestedBy)];
      if (ytType === 'playlist') return youtubePlaylistToSongs(query, requestedBy);

      const spType = playdl.sp_validate(query);
      if (spType === 'track') return [await spotifyUrlToSong(query, requestedBy)];
      if (spType === 'playlist' || spType === 'album') {
        return spotifyCollectionToSongs(query, requestedBy);
      }
    }

    const ytResults = await searchYoutube(query, 1);
    if (ytResults.length) {
      return [youtubeVideoToSong(ytResults[0], requestedBy)];
    }

    if (isSpotifyConfigured()) {
      await ensureSpotifyToken();
      const spResults = await playdl.search(query, { source: { spotify: 'track' }, limit: 1 });
      if (spResults.length) {
        return [await spotifyTrackToSong(spResults[0], requestedBy)];
      }
    }

    return [];
  } catch (err) {
    if (err.message?.includes('browseId')) {
      throw new Error('Recherche impossible pour ce titre. Essaie une autre formulation ou une URL YouTube.');
    }
    throw err;
  }
}

async function searchOneSong(query, requestedBy) {
  try {
    const ytResults = await searchYoutube(query, 1);
    if (ytResults.length) {
      return youtubeVideoToSong(ytResults[0], requestedBy);
    }
  } catch (err) {
    console.warn(`Résolution IA ignorée "${query}":`, err.message);
  }
  return null;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function resolveAiTracks(tracks, requestedBy) {
  const queries = tracks.map((t) => (t.artist ? `${t.title} ${t.artist}` : t.title));
  const resolved = await mapWithConcurrency(queries, 4, (q) => searchOneSong(q, requestedBy));
  return resolved.filter(Boolean);
}

export {
  isSpotifyConfigured,
  searchSuggestions,
  resolveQuery,
  resolveAiTracks,
};
