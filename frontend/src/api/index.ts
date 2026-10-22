// Picks the backend: VITE_BACKEND=mock (default for `npm run dev`) or sap (build, `npm run dev:sap`).
import { mockApi } from './mock';
import { odataApi } from './odata';
import type { Api } from './types';

export const api: Api = import.meta.env.VITE_BACKEND === 'sap' ? odataApi : mockApi;
export * from './types';
