import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) console.error('Sign in error:', error);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Sign out error:', error);
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function loadPlannerData() {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('planner_data')
    .select('data')
    .eq('id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Load error:', error);
    return null;
  }
  return data?.data || null;
}

export async function savePlannerData(plannerData) {
  const user = await getUser();
  if (!user) return;

  const { error } = await supabase
    .from('planner_data')
    .upsert({
      id: user.id,
      user_id: user.id,
      data: plannerData,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Save error:', error);
  }
}
