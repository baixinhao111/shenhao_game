// Normal builds talk to the real server. `vite build --mode demo` swaps this
// module for src/demo/backendDemo.ts (see vite.config.ts).
export const demoRequest: null | ((path: string, options?: { method?: string; body?: any }) => Promise<any>) = null;
