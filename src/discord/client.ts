import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  MessageFlags,
  type Interaction,
} from 'discord.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { commands } from './commands/index.js';
import { attachMessageHandler } from './handlers/messageHandler.js';
import { attachButtonHandler } from './handlers/buttonHandler.js';

export function buildClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ user: c.user.tag }, 'Discord client ready');
  });

  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    void handleInteraction(interaction);
  });

  attachMessageHandler(client);
  attachButtonHandler(client);

  return client;
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isButton()) return; // handled by attachButtonHandler
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, 'slash command failed');
    const message = 'Something went wrong handling that command.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
}

export async function startClient(client: Client): Promise<void> {
  const config = loadConfig();
  await client.login(config.DISCORD_BOT_TOKEN);
}
