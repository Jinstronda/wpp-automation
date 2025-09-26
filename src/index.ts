import fs from 'fs';
import path from 'path';

const requiredDirectories: string[] = [
  'src/automation',
  'src/ai',
  'src/scheduler',
  'src/ui',
  'src/config',
  'src/data',
  'src/state',
  'src/utils',
  'logs'
];

function ensureDirectoryExists(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function main(): void {
  const workspaceRoot: string = process.cwd();

  // Create required runtime folders at root
  ['data', 'logs', 'state'].forEach((dirName) => {
    ensureDirectoryExists(path.join(workspaceRoot, dirName));
  });

  // Scaffold source folders if missing
  requiredDirectories.forEach((dir) => {
    ensureDirectoryExists(path.join(workspaceRoot, dir));
  });

  // Seed minimal config files if absent
  const promptsPath: string = path.join(workspaceRoot, 'src', 'config', 'prompts.json');
  const settingsPath: string = path.join(workspaceRoot, 'src', 'config', 'settings.json');

  if (!fs.existsSync(promptsPath)) {
    fs.writeFileSync(promptsPath, JSON.stringify({ default: ["Hi {{business}}, quick question about your services." ] }, null, 2));
  }

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({ delayMs: { min: 1200, max: 3200 }, retries: 2, model: "openai:gpt-4o-mini" }, null, 2));
  }

  // Touch typical data/state files if missing
  const messageLogsPath: string = path.join(workspaceRoot, 'src', 'data', 'message_logs.json');
  const promptStatsPath: string = path.join(workspaceRoot, 'src', 'data', 'prompt_stats.json');
  const leadsCsvPath: string = path.join(workspaceRoot, 'src', 'data', 'leads.csv');
  const stateFilePath: string = path.join(workspaceRoot, 'src', 'state', 'session.json');

  if (!fs.existsSync(messageLogsPath)) fs.writeFileSync(messageLogsPath, '[]');
  if (!fs.existsSync(promptStatsPath)) fs.writeFileSync(promptStatsPath, '{}');
  if (!fs.existsSync(leadsCsvPath)) fs.writeFileSync(leadsCsvPath, 'name,phone,businessName,promptVariant');
  if (!fs.existsSync(stateFilePath)) fs.writeFileSync(stateFilePath, JSON.stringify({ contacts: [] }, null, 2));

  console.log('Scaffold complete. Folders/files ensured.');
}

main();


