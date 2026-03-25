import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PLANNER_ID = 'default';

export async function loadPlannerData() {
  const { data, error } = await supabase
    .from('planner_data')
    .select('data')
    .eq('id', PLANNER_ID)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Load error:', error);
    return null;
  }
  return data?.data || null;
}

export async function savePlannerData(plannerData) {
  const { error } = await supabase
    .from('planner_data')
    .upsert({
      id: PLANNER_ID,
      data: plannerData,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Save error:', error);
  }
}
