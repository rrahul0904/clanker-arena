import path from 'node:path';

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  generatorMode: process.env.GENERATOR_MODE || 'mock',
  judgeMode: process.env.JUDGE_MODE || 'local',
  dataFile: path.resolve(process.cwd(), process.env.DATA_FILE || '.data/state.json'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || '',
  judge0Url: (process.env.JUDGE0_URL || '').replace(/\/$/, ''),
  judge0Token: process.env.JUDGE0_TOKEN || '',
  judge0LanguageId: Number(process.env.JUDGE0_LANGUAGE_ID || 71),
  allowUnsafeRemoteCodeLocally: process.env.ALLOW_UNSAFE_REMOTE_CODE_LOCALLY === '1',
};
