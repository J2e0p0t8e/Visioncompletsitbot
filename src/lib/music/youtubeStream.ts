// @ts-nocheck
import fs from "fs";
import path from "path";
import { StreamType  } from "@discordjs/voice";
import ffmpegPath from "ffmpeg-static";
import ytDlpWrapImport from 'yt-dlp-wrap';
const YTDlpWrap = (ytDlpWrapImport as any).default || ytDlpWrapImport;

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const YTDLP_PATH = path.join(__dirname, '..', '..', '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const CACHE_DIR = path.join(__dirname, '..', '..', '..', '.cache', 'audio');
let ytDlpReady = null;

function ensureYtDlp() {
  if (!ytDlpReady) {
    ytDlpReady = (async () => {
      if (!fs.existsSync(path.dirname(YTDLP_PATH))) {
        fs.mkdirSync(path.dirname(YTDLP_PATH), { recursive: true });
      }
      if (!fs.existsSync(YTDLP_PATH)) {
        console.log('⬇️ Téléchargement de yt-dlp (première lecture)...');
        await YTDlpWrap.downloadFromGithub(
          YTDLP_PATH,
          undefined,
          process.platform === 'win32' ? 'win32' : process.platform
        );
        console.log('✅ yt-dlp prêt');
      }
      return new YTDlpWrap(YTDLP_PATH);
    })();
  }
  return ytDlpReady;
}

function normalizeYoutubeUrl(song) {
  if (song.videoId) {
    return `https://www.youtube.com/watch?v=${song.videoId}`;
  }
  if (song.url?.startsWith('http')) {
    return song.url;
  }
  throw new Error('URL YouTube invalide');
}

function getVideoId(song) {
  if (song.videoId) return song.videoId;
  const match = song.url?.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  if (match) return match[1];
  throw new Error('ID YouTube introuvable');
}

function getInputType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webm') return StreamType.WebmOpus;
  if (ext === '.opus' || ext === '.ogg') return StreamType.OggOpus;
  return StreamType.Arbitrary;
}

function findCachedFile(videoId) {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const file = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(`${videoId}.`));
  return file ? path.join(CACHE_DIR, file) : null;
}

function buildPlayback(filePath) {
  const stream = fs.createReadStream(filePath, { highWaterMark: 1 << 25 });
  return {
    stream,
    filePath,
    inputType: getInputType(filePath),
  };
}

async function downloadYoutubeAudio(song) {
  const url = normalizeYoutubeUrl(song);
  const videoId = getVideoId(song);
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const cached = findCachedFile(videoId);
  if (cached) {
    console.log(`📂 Cache audio: ${path.basename(cached)}`);
    return buildPlayback(cached);
  }

  const ytDlp = await ensureYtDlp();
  const output = path.join(CACHE_DIR, `${videoId}.%(ext)s`);

  console.log(`⬇️ Téléchargement audio: ${song.title}`);
  
  const ytDlpArgs = [
    url,
    '-f',
    'bestaudio/best',
    '-o',
    output,
    '--no-playlist',
    '--no-part',
    '--no-warnings',
    '--ffmpeg-location',
    ffmpegPath,
    '--force-overwrites',
  ];

  const cookiesPath = path.join(__dirname, '..', '..', '..', 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    ytDlpArgs.push('--cookies', cookiesPath);
  }

  await ytDlp.execPromise(ytDlpArgs);

  const filePath = findCachedFile(videoId);
  if (!filePath) throw new Error('Téléchargement audio échoué');

  const size = fs.statSync(filePath).size;
  if (size < 50_000) {
    fs.unlinkSync(filePath);
    throw new Error('Fichier audio trop petit (téléchargement incomplet)');
  }

  console.log(`✅ Audio prêt: ${path.basename(filePath)} (${Math.round(size / 1024)} Ko)`);
  return buildPlayback(filePath);
}

function killPlayback(handles) {
  if (!handles) return;
  try {
    handles.stream?.destroy();
  } catch {}
}

export {
  ensureYtDlp,
  downloadYoutubeAudio,
  normalizeYoutubeUrl,
  killPlayback,
};
