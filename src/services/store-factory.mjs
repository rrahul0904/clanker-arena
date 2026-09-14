import { JsonStore } from '../domain/store.mjs';
import { SupabaseStore } from './supabase-store.mjs';

export function createStore(config) {
  if (config.storageMode === 'json') return new JsonStore(config.dataFile);
  if (config.storageMode === 'supabase') return new SupabaseStore(config);
  throw new Error(`Unsupported storage mode: ${config.storageMode}`);
}
