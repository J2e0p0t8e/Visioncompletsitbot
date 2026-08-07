import { createServer } from "node:http";
import {
  Client,
  Events,
  Interaction,
  IntentsBitField,
  MessageFlags,
  Partials,
} from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { registerMessageListener } from "./listeners/messages.js";
import { registerReactionListener } from "./listeners/reactions.js";
import { registerVoiceListener, getVoiceSessionCount } from "./listeners/voice.js";
import { setupDailyLeaderboard } from "./lib/daily-leaderboard.js";

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

(client as any).queues = new Map(); // Inject queues map for music bot logic

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

registerMessageListener(client);
registerReactionListener(client);
registerVoiceListener(client);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Vision+ Bot connecté : ${readyClient.user.tag}`);
  console.log(
    `[XP] Messages +${config.xp.message} | Réactions +${config.xp.reaction} | Vocal +${config.xp.voicePerMinute}/min`
  );

  // Initialiser la publication automatique quotidienne dans 🔝・vision-chart
  setupDailyLeaderboard(readyClient);
});

// Import music interaction handlers
import { safeAutocompleteRespond, isIgnorableAutocompleteError } from "./lib/music/autocomplete.js";
import { handlePlayerButton } from "./lib/music/playerPanel.js";

function isIgnorableInteractionError(err: any) {
  return err?.code === 10062 || err?.code === 40060 || err?.message?.includes('Unknown interaction');
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commandMap.get(interaction.commandName);
    if (command && (command as any).autocomplete) {
      try {
        await (command as any).autocomplete(interaction, client);
      } catch (err: any) {
        if (!isIgnorableAutocompleteError(err)) {
          console.error(`Autocomplete ${interaction.commandName}:`, err.message);
        }
        await safeAutocompleteRespond(interaction, []);
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('player:')) {
    try {
      await handlePlayerButton(interaction, client);
    } catch (err: any) {
      if (!isIgnorableInteractionError(err)) {
        console.error('Erreur bouton lecteur:', err.message);
      }
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Erreur du lecteur.', flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    // Pass client as the second argument as expected by music bot commands
    await (command.execute as any)(interaction, client);
  } catch (error: any) {
    if (!isIgnorableInteractionError(error)) {
        console.error(`Erreur /${interaction.commandName}:`, error);
    }
    if (isIgnorableInteractionError(error)) return;
    
    const msg = "Une erreur est survenue. Réessaie dans un instant.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: msg,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: msg,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      service: "vision-bot",
      discord: client.isReady() ? "connected" : "connecting",
      voiceTracked: getVoiceSessionCount(),
    })
  );
}).listen(config.port, () => {
  console.log(`Healthcheck : http://localhost:${config.port}/health`);
});

await client.login(config.token);
