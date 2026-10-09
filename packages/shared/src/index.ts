export * from './auth';
export * from './campaigns';
export * from './characters';
export * from './chronicle';
export * from './combat';
export * from './compendium';
export * from './constellation';
export * from './realtime';
export * from './recording';
export * from './weight';

/** Format d'erreur unique renvoyé par l'API. */
export interface ApiErrorBody {
  error: {
    code: 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'internal';
    message: string;
    details?: unknown;
  };
}
