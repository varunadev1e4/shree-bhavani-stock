// The signed-in person's display name: the name saved on the login (Menu > About > Name), otherwise the part of the email before the @.
export const nameOf = (user) => {
  if (!user) return ''
  const m = user.user_metadata || {}
  const n = (m.full_name || m.name || '').trim()
  if (n) return n
  const e = String(user.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim()
  return e.replace(/\b\w/g, (c) => c.toUpperCase())
}
