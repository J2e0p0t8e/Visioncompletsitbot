// @ts-nocheck
import ffmpegPath from "ffmpeg-static";
import { ensureYtDlp  } from "./youtubeStream.js";

const YTDLP_ARGS = ['--no-warnings', '--ffmpeg-location', ffmpegPath, '--ignore-errors'];

function parseJsonLines(output) {
  if (!output?.trim()) return [];
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function mapResult(data) {
  if (!data?.id || !data?.title) return null;
  return {
    id: data.id,
    title: data.title,
    channel: data.channel || data.uploader || data.channel_id || 'YouTube',
    durationRaw: data.duration_string || 'Inconnue',
    durationInSec: data.duration || 0,
    thumbnails: data.thumbnail ? [{ url: data.thumbnail }] : [],
    url: `https://www.youtube.com/watch?v=${data.id}`,
  };
}

async function searchYoutube(query, limit = 5) {
  const ytDlp = await ensureYtDlp();
  try {
    const output = await ytDlp.execPromise([
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '-j',
      ...YTDLP_ARGS,
    ]);
    return parseJsonLines(output).map(mapResult).filter(Boolean);
  } catch (err) {
    console.warn('Recherche YouTube:', err.message);
    return [];
  }
}

async function getYoutubeMetadata(urlOrId) {
  const url = urlOrId.startsWith('http')
    ? urlOrId
    : `https://www.youtube.com/watch?v=${urlOrId}`;
  const ytDlp = await ensureYtDlp();
  try {
    const output = await ytDlp.execPromise([url, '-j', '--no-playlist', ...YTDLP_ARGS]);
    const data = JSON.parse(output.trim());
    return mapResult(data);
  } catch (err) {
    console.warn('Métadonnées YouTube:', err.message);
    return null;
  }
}

export { searchYoutube, getYoutubeMetadata };
