import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  type ChatInputCommandInteraction,
  Collection,
  type SlashCommandBuilder,
  type SlashCommandOptionsOnlyBuilder,
} from 'discord.js';
import * as link from './link.js';
import * as unlink from './unlink.js';
import * as status from './status.js';
import * as projects from './projects.js';
import * as builds from './builds.js';
import * as branch from './branch.js';
import * as help from './help.js';
import { loadConfig } from '../../config.js';
import { logger } from '../../logger.js';

type CommandModule = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

const modules: CommandModule[] = [link, unlink, status, projects, builds, branch, help];

export const commands = new Collection<string, CommandModule>(
  modules.map((m) => [m.data.name, m]),
);

export async function registerCommands(): Promise<void> {
  const config = loadConfig();
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
  const body: RESTPostAPIChatInputApplicationCommandsJSONBody[] = modules.map((m) =>
    m.data.toJSON(),
  );
  logger.info({ count: body.length }, 'registering Discord slash commands globally');
  await rest.put(Routes.applicationCommands(config.DISCORD_APPLICATION_ID), { body });
  logger.info('slash commands registered');
}
