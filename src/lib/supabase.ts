import { createClient } from '@supabase/supabase-js';

// These should be set in the environment variables (Settings -> Environment Variables)
// In Vite, they are prefixed with VITE_ for client-side access.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Fallback to avoid crash if keys are missing during module load
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://') && !supabaseUrl.includes('supabase.com/dashboard'));

export const getPublicUrl = (bucket: string, path: string | null | undefined) => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

// Test connection
if (supabaseUrl && supabaseAnonKey) {
  supabase.auth.getSession()
    .then(({ error }) => {
      if (error) {
        console.error('Supabase connection error:', error.message);
        if (error.message.includes('fetch')) {
          console.error('PRO TIP: Check if VITE_SUPABASE_URL is correct (starts with https:// and ends with .supabase.co)');
        }
      } else {
        console.log('Supabase connected successfully!');
      }
    })
    .catch(err => {
      console.error('CRITICAL: Supabase fetch failed altogether.', err);
      if (supabaseUrl.includes('supabase.com/dashboard')) {
        console.error('ERROR: You used the Dashboard URL instead of the API URL. Please use https://your-project-id.supabase.co');
      }
    });
}
