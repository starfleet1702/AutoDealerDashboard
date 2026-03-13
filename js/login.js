import { signIn } from './supabaseClient.js';

// Redirect target after successful login (set to your app home/dashboard)
const DASHBOARD_PATH = '/dashboard.html';

// Expose a small adapter so Alpine.js in the page can call it easily.
window.handleLogin = async ({ username, password, setError, setSuccess, setLoading }) => {
  try {
    setLoading(true);
    const { data, error } = await signIn({ username, password });
    setLoading(false);
    if (error) {
      setError(error.message || 'Login failed');
      if (window.notify && window.notify.error) window.notify.error(error.message || 'Login failed');
      return { data: null, error };
    }
    setSuccess('Login successful');
    if (window.notify && window.notify.success) window.notify.success('Login successful');
    // Small delay so the success message is visible before redirecting
    setTimeout(() => { window.location.href = DASHBOARD_PATH; }, 600);
    return { data, error: null };
  } catch (err) {
    setLoading(false);
    setError(err.message || 'Unexpected error');
    return { data: null, error: err };
  }
};
