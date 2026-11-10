// One place for the Worker address. Override for testing with VITE_API_URL
// (for example a Worker preview URL); production uses the live Worker.
export const API_URL = import.meta.env.VITE_API_URL || 'https://revesvoir-api.nicole-scheid.workers.dev';
