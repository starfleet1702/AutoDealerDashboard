// Modular Supabase client with a local mock fallback.
// Set your Supabase credentials below. Keep credentials defined in this module only.

const SUPABASE_URL = 'https://jkcccubdqqowmdlaewks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprY2NjdWJkcXFvd21kbGFld2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4OTYsImV4cCI6MjA4ODk4MTg5Nn0.zNp1VZknWCsekNQ5XcN9JoAf5lAb0oYVXx14oK6BA3E';

let _supabaseClient = null;

export async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _supabaseClient;
}

export async function signIn({ username, password }) {
  const supabase = await getSupabaseClient();
  if (supabase) {
    // Treat 'username' as email for Supabase auth. Adjust as needed for real username flows.
    const res = await supabase.auth.signInWithPassword({ email: username, password });
    if (res.error) return { data: null, error: res.error };
    return { data: res.data, error: null };
  }

  // Local mock fallback for development/demo purposes
  await new Promise((r) => setTimeout(r, 500));
  if ((username === 'admin' || username === 'admin@example.com') && password === 'password') {
    return { data: { user: { id: 'mock-1', email: 'admin@example.com' } }, error: null };
  }
  return { data: null, error: { message: 'Invalid credentials (mock)' } };
}
