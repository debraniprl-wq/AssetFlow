import { createClient } from '@supabase/supabase-js';
import { MockQueryBuilder, executeMockRpc } from './mockStore';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !rawUrl.includes('<your-project-ref>') &&
  !rawKey.includes('<your-anon-public-key>')
);

const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://placeholder-project.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

const rawSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper for Demo Mode
export function isDemoModeActive(): boolean {
  try {
    const val = localStorage.getItem('assetflow_demo_mode');
    // Default to true if not explicitly set to 'false',
    // since the database tables have not yet been migrated.
    if (val === null) return true;
    return val === 'true';
  } catch {
    return true;
  }
}

export function setDemoModeActive(enabled: boolean) {
  try {
    localStorage.setItem('assetflow_demo_mode', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('assetflow_demo_mode_changed'));
  } catch (err) {
    console.error(err);
  }
}

// Proxied supabase client that uses MockQueryBuilder in demo mode or as fallback
export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (tableName: string) => {
        if (isDemoModeActive()) {
          return new MockQueryBuilder(tableName);
        }

        // If not in demo mode, query live Supabase, but fall back if table does not exist
        const originalQuery = (target as any).from(tableName);
        return new Proxy(originalQuery, {
          get(qTarget, qProp) {
            const originalMethod = qTarget[qProp];
            if (typeof originalMethod === 'function') {
              return (...args: any[]) => {
                const res = originalMethod.apply(qTarget, args);
                if (res && typeof res.then === 'function') {
                  return new Promise((resolve, reject) => {
                    res.then((output: any) => {
                      if (output?.error && (output.error.code === 'PGRST205' || output.error.message?.includes('schema cache'))) {
                        console.warn(`[AssetFlow] Table "${tableName}" not found in Supabase. Falling back to local sample data.`);
                        // Auto-execute mock query instead
                        new MockQueryBuilder(tableName).then(resolve, reject);
                        return;
                      }
                      resolve(output);
                    }).catch((err: any) => {
                      console.warn(`[AssetFlow] Live query failed for "${tableName}". Falling back to local sample data.`, err);
                      new MockQueryBuilder(tableName).then(resolve, reject);
                    });
                  });
                }
                return res;
              };
            }
            return originalMethod;
          },
        });
      };
    }

    if (prop === 'rpc') {
      return (fnName: string, args?: any) => {
        if (isDemoModeActive()) {
          return executeMockRpc(fnName, args);
        }
        const promise = (target as any).rpc(fnName, args);
        if (promise && typeof promise.then === 'function') {
          return new Promise((resolve, reject) => {
            promise.then((output: any) => {
              if (output?.error && (output.error.code === 'PGRST202' || output.error.message?.includes('schema cache') || output.error.message?.includes('function'))) {
                console.warn(`[AssetFlow] Function "${fnName}" not found in Supabase. Falling back to local mock.`);
                executeMockRpc(fnName, args).then(resolve, reject);
                return;
              }
              resolve(output);
            }).catch((err: any) => {
              console.warn(`[AssetFlow] Live RPC "${fnName}" failed. Falling back to local mock.`, err);
              executeMockRpc(fnName, args).then(resolve, reject);
            });
          });
        }
        return promise;
      };
    }

    if (prop === 'channel') {
      return (channelName: string) => {
        if (isDemoModeActive() || !isSupabaseConfigured) {
          const fakeChannel: any = {
            on: () => fakeChannel,
            subscribe: () => fakeChannel,
            unsubscribe: () => {},
          };
          return fakeChannel;
        }
        return (target as any).channel(channelName);
      };
    }

    if (prop === 'removeChannel') {
      return (channel: any) => {
        if (isDemoModeActive() || !isSupabaseConfigured) return;
        return (target as any).removeChannel(channel);
      };
    }

    return Reflect.get(target, prop, receiver);
  },
});

