// The backend is chosen at build time from VITE_BACKEND: mock (default for `npm run dev`), sap (build, `npm run dev:sap`)
// or supabase (standalone, `npm run dev:cloud`). vite.config.ts points the @backend alias at that one file, so a build
// carries only its own backend (type-checking and tests use the mock).
import backendApi from '@backend';
import type { Api } from './types';

export const api: Api = backendApi;
export * from './types';
