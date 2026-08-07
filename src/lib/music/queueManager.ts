// @ts-nocheck
import { createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
 } from "@discordjs/voice";
import { downloadYoutubeAudio, killPlayback  } from "./youtubeStream.js";
import { sendOrUpdatePanel, finalizePanel  } from "./playerPanel.js";
import { sendPinnedPanel  } from "./pinManager.js";
import { ensureQueueVoiceReady, scheduleQueueReconnect } from "./voiceManager.js";

const IDLE_LEAVE_MS = 60_000;

function cancelLeaveTimer(queue) {
  if (!queue.leaveTimer) return;
  clearTimeout(queue.leaveTimer);
  queue.leaveTimer = null;
}

function scheduleLeave(queue) {
  cancelLeaveTimer(queue);
  if (queue.pinned || queue.songs.length || queue.playing || queue.processing) return;

  queue.leaveTimer = setTimeout(() => {
    queue.leaveTimer = null;
    if (queue.pinned || queue.songs.length || queue.playing || queue.processing) return;

    try {
      if (queue.connection?.state?.status !== VoiceConnectionStatus.Destroyed) {
        queue.connection.destroy();
      }
    } catch {}

    queue.client?.queues?.delete(queue.voiceChannelId);
    console.log(`👋 Départ vocal [${queue.voiceChannelId}] après ${IDLE_LEAVE_MS / 1000}s d'inactivité`);
  }, IDLE_LEAVE_MS);
}

function bumpPlaybackGeneration(queue) {
  queue.playbackGeneration += 1;
  killPlayback(queue.playback);
  queue.playback = null;
}

function createQueue(guildId, voiceChannelId, connection, textChannel, client = null) {
  const queue = {
    guildId,
    voiceChannelId,
    connection,
    textChannel,
    client,
    songs: [],
    player: createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    }),
    volume: 100,
    loop: false,
    shuffle: false,
    playing: false,
    processing: false,
    playback: null,
    playbackGeneration: 0,
    manualSkip: false,
    pinned: false,
    pinnedBy: null,
    panelMessage: null,
    leaveTimer: null,
    subscription: null,
    currentResource: null,
    _playLock: false,
    _playPending: false,
    _voicePromise: null,
  };

  queue.player.on(AudioPlayerStatus.Idle, () => {
    if (queue.processing) return;
    if (!queue.playing) return;

    queue.playing = false;
    killPlayback(queue.playback);
    queue.playback = null;

    if (!queue.manualSkip && !queue.loop) {
      queue.songs.shift();
    }
    queue.manualSkip = false;

    safePlayNext(queue);
  });

  queue.player.on('error', (err) => {
    console.error('Erreur player:', err.message);
    queue.playing = false;
    bumpPlaybackGeneration(queue);
    if (queue.songs.length) queue.songs.shift();
    queue.processing = false;
    safePlayNext(queue);
  });

  queue.player.on('stateChange', (oldState, newState) => {
    const song = queue.songs[0]?.title || '?';
    console.log(`🎵 [${queue.voiceChannelId}] ${song}: ${oldState.status} → ${newState.status}`);
  });

  return queue;
}

function normalizeQueueState(queue) {
  if (queue.processing && !queue.playback && !queue._playLock) {
    queue.processing = false;
  }

  if (
    queue.playing &&
    !queue.playback &&
    !queue.processing &&
    !queue._playLock &&
    queue.player.state.status === AudioPlayerStatus.Idle
  ) {
    queue.playing = false;
  }
}

function isPlayerBusy(queue) {
  const status = queue.player.state.status;
  return status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering;
}

function isPlaybackActive(queue) {
  normalizeQueueState(queue);
  return queue.processing || queue.playing || isPlayerBusy(queue) || queue._playLock;
}

function safePlayNext(queue) {
  playNext(queue).catch((err) => {
    console.error('Erreur playNext:', err.message);
    queue.processing = false;
    queue._playLock = false;
  });
}

function requestPlayback(queue) {
  cancelLeaveTimer(queue);
  if (!queue.songs.length) return;
  if (isPlaybackActive(queue)) return;
  safePlayNext(queue);
}

function shuffleUpcoming(queue) {
  if (queue.songs.length <= 1) return;
  const current = queue.songs[0];
  const rest = queue.songs.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  queue.songs = [current, ...rest];
}

async function handleQueueEmpty(queue) {
  queue.playing = false;
  killPlayback(queue.playback);
  queue.playback = null;
  queue.processing = false;

  if (queue.pinned) {
    await finalizePanel(queue);
    await sendPinnedPanel(queue);
    queue.textChannel?.send('✅ File terminée ! Je reste épinglé dans le salon vocal 📌').catch(() => {});
    return;
  }

  await finalizePanel(queue);
  queue.textChannel
    ?.send(`✅ File terminée ! J'attends **1 minute** de nouvelles commandes avant de quitter le salon 👋`)
    .catch(() => {});
  scheduleLeave(queue);
}

async function runPlayNext(queue) {
  cancelLeaveTimer(queue);

  if (!queue.songs.length) {
    await handleQueueEmpty(queue);
    return;
  }

  const song = queue.songs[0];
  const generation = queue.playbackGeneration;
  queue.processing = true;

  try {
    await sendOrUpdatePanel(queue);

    await ensureQueueVoiceReady(queue);

    if (generation !== queue.playbackGeneration) {
      return;
    }

    if (!queue.songs.length || queue.songs[0] !== song) {
      return;
    }

    console.log(`⬇️ Préparation [#1/${queue.songs.length}]: ${song.title}`);
    const playback = await downloadYoutubeAudio(song);
    if (generation !== queue.playbackGeneration) {
      killPlayback(playback);
      return;
    }

    await ensureQueueVoiceReady(queue);

    if (generation !== queue.playbackGeneration) {
      killPlayback(playback);
      return;
    }

    if (!queue.songs.length || queue.songs[0] !== song) {
      killPlayback(playback);
      return;
    }

    queue.playback = playback;

    const resource = createAudioResource(playback.stream, {
      inputType: playback.inputType,
      inlineVolume: true,
    });

    resource.volume.setVolumeLogarithmic(queue.volume / 100);
    queue.currentResource = resource;

    if (
      queue.player.state.status === AudioPlayerStatus.Paused ||
      queue.player.state.status === AudioPlayerStatus.AutoPaused
    ) {
      queue.player.unpause();
    }

    queue.playing = true;
    queue.processing = false;
    queue.player.play(resource);

    try {
      await entersState(queue.player, AudioPlayerStatus.Playing, 8_000);
    } catch {
      /* certains flux passent par Buffering */
    }

    console.log(
      `▶️ Lecture [#1/${queue.songs.length}]: ${song.title} | vocal=${queue.connection?.state?.status} | player=${queue.player.state.status}`
    );
    await sendOrUpdatePanel(queue);
  } catch (err) {
    console.error('Erreur lecture:', err.message);
    killPlayback(queue.playback);
    queue.playback = null;
    queue.playing = false;
    queue.processing = false;

    const isVoiceError =
      err.message?.includes('VOICE_JOIN_FAILED') ||
      err.message?.includes('Serveur introuvable');

    if (isVoiceError && queue.songs.length > 0) {
      scheduleQueueReconnect(queue);
      return;
    }

    if (generation === queue.playbackGeneration && queue.songs[0] === song) {
      queue.textChannel?.send(`❌ Impossible de lire \`${song.title}\` : ${err.message}`).catch(() => {});
      queue.songs.shift();
    }

    safePlayNext(queue);
  }
}

async function playNext(queue) {
  if (queue._playLock) {
    queue._playPending = true;
    return;
  }

  queue._playLock = true;
  try {
    await runPlayNext(queue);
  } finally {
    queue._playLock = false;
    if (queue._playPending) {
      queue._playPending = false;
      safePlayNext(queue);
    }
  }
}

function skipCurrent(queue) {
  if (!queue.songs.length) return;
  if (!isPlaybackActive(queue)) return;

  queue.manualSkip = true;
  bumpPlaybackGeneration(queue);

  if (!queue.loop) {
    queue.songs.shift();
  }

  queue.playing = false;
  queue.processing = false;

  if (queue._playLock) {
    queue._playPending = true;
    return;
  }

  if (isPlayerBusy(queue) || queue.player.state.status !== AudioPlayerStatus.Idle) {
    queue.player.stop(true);
    return;
  }

  safePlayNext(queue);
}

function clearQueue(queue, client, { keepCurrent = false } = {}) {
  if (!queue.songs.length) {
    return { removed: 0, kept: 0 };
  }

  if (keepCurrent) {
    const removed = Math.max(0, queue.songs.length - 1);
    if (removed === 0) {
      return { removed: 0, kept: queue.songs.length };
    }
    queue.songs = queue.songs.slice(0, 1);
    queue.shuffle = false;
    return { removed, kept: 1 };
  }

  const removed = queue.songs.length;
  stopQueue(queue, client);
  return { removed, kept: 0 };
}

function stopQueue(queue, client) {
  cancelLeaveTimer(queue);
  bumpPlaybackGeneration(queue);

  queue.songs = [];
  queue.loop = false;
  queue.shuffle = false;
  queue.playing = false;
  queue.processing = false;
  queue.manualSkip = false;
  queue.player.stop(true);

  if (!queue.pinned) {
    scheduleLeave(queue);
    return;
  }
}

function appendSongs(queue, songs) {
  const startLength = queue.songs.length;
  queue.songs.push(...songs);

  if (queue.shuffle && queue.songs.length > 1) {
    shuffleUpcoming(queue);
  }

  cancelLeaveTimer(queue);
  requestPlayback(queue);

  return {
    startLength,
    addedCount: songs.length,
    positions: songs.map((_, i) => startLength + i + 1),
  };
}

export {
  createQueue,
  playNext,
  requestPlayback,
  skipCurrent,
  stopQueue,
  clearQueue,
  shuffleUpcoming,
  appendSongs,
  normalizeQueueState,
  isPlaybackActive,
  isPlayerBusy,
  cancelLeaveTimer,
  scheduleLeave,
  IDLE_LEAVE_MS,
};
