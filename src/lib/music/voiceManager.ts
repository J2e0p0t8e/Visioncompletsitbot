// @ts-nocheck
import { joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState, } from "@discordjs/voice";
import { createQueue, stopQueue } from "./queueManager.js";
import { requestPlayback, isPlaybackActive } from "./queueManager.js";
import { sendPinnedPanel } from "./pinManager.js";


const reconnectTimers = new Map();

function clearPinnedReconnect(guildId, voiceChannelId) {
  const key = `${guildId}:${voiceChannelId}`;
  const timer = reconnectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(key);
  }
}

function attachVoiceDebug(connection, guildId, voiceChannelId) {
  if (connection._debugAttached) return;
  connection._debugAttached = true;

  connection.on('stateChange', (oldState, newState) => {
    console.log(`🔊 Vocal [${guildId}/${voiceChannelId}]: ${oldState.status} → ${newState.status}`);
  });
  connection.on('error', (err) => {
    console.error(`🔊 Erreur [${guildId}/${voiceChannelId}]:`, err.message);
  });
}

function setupDisconnectHandler(connection, guildId, voiceChannelId, queue) {
  if (connection._disconnectHandlerSet) return;
  connection._disconnectHandlerSet = true;

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 10_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 10_000),
        entersState(connection, VoiceConnectionStatus.Ready, 10_000),
      ]);
      console.log(`🔊 Reconnecté [${guildId}/${voiceChannelId}]`);
      queue.connection = connection;
      ensurePlayerSubscribed(connection, queue);
    } catch {
      console.warn(`🔊 Déconnexion vocale [${guildId}/${voiceChannelId}]`);
      queue.connection = null;

      const hasActiveQueue =
        queue.pinned ||
        queue.songs.length > 0 ||
        queue.playing ||
        queue.processing ||
        queue._playLock;

      if (hasActiveQueue) {
        scheduleQueueReconnect(queue);
        return;
      }

      try {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      } catch {}
    }
  });
}

function scheduleQueueReconnect(queue) {
  const guild = queue.textChannel?.guild;
  if (!guild) return;

  const key = `${guild.id}:${queue.voiceChannelId}`;
  if (reconnectTimers.has(key)) return;

  reconnectTimers.set(
    key,
    setTimeout(async () => {
      reconnectTimers.delete(key);
      const stillActive =
        queue.pinned ||
        queue.songs.length > 0 ||
        queue.playing ||
        queue.processing ||
        queue._playLock;
      if (!stillActive) return;

      try {
        await ensureQueueVoiceReady(queue);

        if (!isPlaybackActive(queue)) {
          requestPlayback(queue);
        }
        if (queue.pinned) {

          await sendPinnedPanel(queue);
        }
        console.log(`🔊 Reconnexion file OK [${queue.voiceChannelId}] (${queue.songs.length} titre(s))`);
      } catch (err) {
        console.error(`🔊 Reconnexion file échouée [${queue.voiceChannelId}]:`, err.message);
        scheduleQueueReconnect(queue);
      }
    }, 2000)
  );
}

function schedulePinnedReconnect(queue) {
  scheduleQueueReconnect(queue);
}

function ensurePlayerSubscribed(connection, queue) {
  if (!connection || connection.state.status !== VoiceConnectionStatus.Ready) return null;

  if (queue.subscription?.connection === connection) {
    return queue.subscription;
  }

  if (queue.subscription) {
    try {
      queue.subscription.unsubscribe();
    } catch {}
    queue.subscription = null;
  }

  queue.subscription = connection.subscribe(queue.player);

  const status = queue.player.state.status;
  if (
    status === AudioPlayerStatus.Paused ||
    status === AudioPlayerStatus.AutoPaused
  ) {
    queue.player.unpause();
  }

  return queue.subscription;
}

async function waitForReady(connection, timeoutMs = 20_000) {
  if (connection.state.status === VoiceConnectionStatus.Ready) return true;
  if (connection.state.status === VoiceConnectionStatus.Destroyed) return false;

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

async function joinFreshConnection(guild, voiceChannelId, guildId) {
  const connection = joinVoiceChannel({
    channelId: voiceChannelId,
    guildId,
    group: voiceChannelId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  attachVoiceDebug(connection, guildId, voiceChannelId);

  const ready = await waitForReady(connection, 45_000);
  if (!ready) {
    const status = connection.state?.status ?? 'inconnu';
    try {
      connection.destroy();
    } catch {}
    const err = new Error(`VOICE_JOIN_FAILED:${status}`);
    err.status = status;
    throw err;
  }

  return connection;
}

async function ensurePinnedVoice(queue, guild) {
  if (!queue.pinned) return queue.connection;

  const voiceChannelId = queue.voiceChannelId;
  const guildId = guild.id;
  let connection = getVoiceConnection(guildId, voiceChannelId);

  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    const ready = await waitForReady(connection, 20_000);
    if (ready) {
      queue.connection = connection;
      setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
      ensurePlayerSubscribed(connection, queue);
      return connection;
    }
  }

  connection = await joinFreshConnection(guild, voiceChannelId, guildId);
  queue.connection = connection;
  setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
  ensurePlayerSubscribed(connection, queue);
  return connection;
}

async function connectToVoice(guild, member, textChannel, client, voiceChannelOverride = null) {
  const guildId = guild.id;
  const voiceChannel = voiceChannelOverride ?? member.voice?.channel ?? null;

  if (!voiceChannel) {
    throw new Error('NO_VOICE');
  }

  const perms = voiceChannel.permissionsFor(guild.client.user);
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    throw new Error('NO_PERMS');
  }

  const voiceChannelId = voiceChannel.id;
  clearPinnedReconnect(guildId, voiceChannelId);

  // Un bot ne peut être que dans UN salon vocal par serveur.
  // On libère toute autre file active de ce bot dans le même serveur.
  for (const other of [...client.queues.values()]) {
    if (other.guildId !== guildId || other.voiceChannelId === voiceChannelId) continue;

    if (other.pinned) {
      const err = new Error('PINNED_ELSEWHERE');
      err.channelId = other.voiceChannelId;
      throw err;
    }

    stopQueue(other, client);
    clearPinnedReconnect(guildId, other.voiceChannelId);
    try {
      if (other.connection?.state?.status !== VoiceConnectionStatus.Destroyed) {
        other.connection?.destroy();
      }
    } catch {}
    client.queues.delete(other.voiceChannelId);
  }

  let queue = client.queues.get(voiceChannelId);
  let connection = getVoiceConnection(guildId, voiceChannelId);

  if (queue) {
    queue.textChannel = textChannel;
    queue.client = client;

    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const ready = await waitForReady(connection, queue.pinned ? 25_000 : 12_000);
      if (ready) {
        queue.connection = connection;
        setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
        ensurePlayerSubscribed(connection, queue);
        return { connection, queue };
      }
    }

    connection = await joinFreshConnection(guild, voiceChannelId, guildId);
    queue.connection = connection;
    client.queues.set(voiceChannelId, queue);
    setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
    ensurePlayerSubscribed(connection, queue);
    return { connection, queue };
  }

  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    try {
      connection.destroy();
    } catch {}
  }

  connection = await joinFreshConnection(guild, voiceChannelId, guildId);
  queue = createQueue(guildId, voiceChannelId, connection, textChannel, client);
  client.queues.set(voiceChannelId, queue);
  setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
  ensurePlayerSubscribed(connection, queue);

  return { connection, queue };
}

async function ensureVoiceConnection(interaction, client, voiceChannelOverride = null) {
  return connectToVoice(
    interaction.guild,
    interaction.member,
    interaction.channel,
    client,
    voiceChannelOverride
  );
}

async function resolveQueueVoice(queue) {
  const guild = queue.textChannel?.guild;
  if (!guild) throw new Error('Serveur introuvable');

  const { guildId, voiceChannelId } = queue;
  clearPinnedReconnect(guildId, voiceChannelId);
  let connection = getVoiceConnection(guildId, voiceChannelId);

  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    if (queue.pinned) {
      connection = await ensurePinnedVoice(queue, guild);
    } else {
      connection = await joinFreshConnection(guild, voiceChannelId, guildId);
      queue.connection = connection;
      setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
    }
  } else {
    const ready = await waitForReady(connection, queue.pinned ? 25_000 : 15_000);
    if (!ready) {
      if (queue.pinned) {
        connection = await ensurePinnedVoice(queue, guild);
      } else {
        try {
          connection.destroy();
        } catch {}
        connection = await joinFreshConnection(guild, voiceChannelId, guildId);
        queue.connection = connection;
        setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
      }
    } else {
      queue.connection = connection;
      setupDisconnectHandler(connection, guildId, voiceChannelId, queue);
    }
  }

  ensurePlayerSubscribed(connection, queue);
  return connection;
}

async function ensureQueueVoiceReady(queue) {
  if (queue._voicePromise) {
    return queue._voicePromise;
  }

  queue._voicePromise = resolveQueueVoice(queue);
  try {
    return await queue._voicePromise;
  } finally {
    queue._voicePromise = null;
  }
}

export {
  connectToVoice,
  ensureVoiceConnection,
  ensurePinnedVoice,
  ensureQueueVoiceReady,
  schedulePinnedReconnect,
  scheduleQueueReconnect,
  clearPinnedReconnect,
};
