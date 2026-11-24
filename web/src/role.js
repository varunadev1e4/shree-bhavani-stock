import { supabase } from './supabase'

// Who is logged in: owner (everything), staff (own expenses/trips/attendance), none (no access yet).
// If the roles table is not created yet (migration-23 not run), behave as before: everybody is the owner.
export async function getRole(email) {
  const { data, error } = await supabase.from('app_roles').select('role,emp_id').eq('email', String(email || '').toLowerCase()).limit(1)
  if (error) return { role: 'owner', legacy: true }
  if (!data || !data.length) return { role: 'none' }
  return { role: data[0].role, emp_id: data[0].emp_id }
}
