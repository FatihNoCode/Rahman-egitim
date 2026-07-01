// Auto-generated Supabase configuration
// These values are provided by the Figma Make environment

// Extract project ID from window location or use environment variable
const getProjectId = (): string => {
  // Try window.location first (Figma Make injects this)
  if (typeof window !== 'undefined' && window.location) {
    const match = window.location.hostname.match(/^([a-z]+)\.supabase\.co$/);
    if (match) return match[1];
  }
  // Fallback to environment variable or default
  return import.meta.env.VITE_SUPABASE_PROJECT_ID || 'rgwrqagnnwszpafyplbz';
};

const getAnonKey = (): string => {
  // Check if Figma Make has injected the key
  if (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) {
    return (window as any).__SUPABASE_ANON_KEY__;
  }
  // Fallback to environment variable or default demo key
  return import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
};

export const projectId = getProjectId();
export const publicAnonKey = getAnonKey();
