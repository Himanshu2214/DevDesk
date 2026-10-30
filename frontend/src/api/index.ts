// Picks the backend: VITE_BACKEND=mock (default for `npm run dev`), sap (build, `npm run dev:sap`) or supabase (standalone, `npm run dev:cloud`).
import { mockApi } from './mock';
import { odataApi } from './odata';
import { supabaseApi } from './supabase';
import type { Api } from './types';

const backend = import.meta.env.VITE_BACKEND;
export const api: Api = backend === 'sap' ? odataApi : backend === 'supabase' ? supabaseApi : mockApi;
export * from './types';
