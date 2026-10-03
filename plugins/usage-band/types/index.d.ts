export type Tokens = { input: number; output: number; cache: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { tokens: Tokens; tick: number }
  }
}
