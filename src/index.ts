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

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const commandMap = new Map(commands.map((c) => [c.data.name, c]));

registerMessageListener(client);
registerReactionListener(client);
registerVoiceListener(client);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Vision+ Bot connecté : ${readyClient.user.tag}`);
  console.log(
    `[XP] Messages +${config.xp.message} | Réactions +${config.xp.reaction} | Vocal +${config.xp.voicePerMinute}/min`
  );
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Erreur /${interaction.commandName}:`, error);
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
