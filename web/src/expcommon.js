import { supabase } from './supabase'

// Shared by the owner's Expenses screen and the employee's screen.
export const DEFAULT_CATS = ['Rent', 'Electricity', 'Fuel / transport', 'Tea / food', 'Packing', 'Repairs', 'Phone / internet', 'Fees / licence', 'Stationery', 'Other']
export const STAFF_CATS = ['Fuel', 'Travel', 'Food', 'Packing', 'Repairs', 'Other']
export const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
export const dm = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
export const span = (ym) => { const y = Math.floor(ym / 100), m = ym % 100; return { from: y + '-' + String(m).padStart(2, '0') + '-01', to: y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0') } }
export const money = (v) => Math.round((Number(v) || 0) * 100) / 100

const BUCKET = 'expense-bills'

// Shrink a phone photo to about 100-200 KB before uploading
async function shrink(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
    const k = Math.min(1, 1280 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.7))
  } finally { URL.revokeObjectURL(url) }
}
// Returns the stored path, or throws
export async function uploadBill(file, folder) {
  const blob = await shrink(file)
  const path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.jpg'
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}
export async function billUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}
// Big spends stand out: more than 3 times that category's usual amount (and at least Rs 1,000)
export function flagged(rows) {
  const by = new Map()
  rows.forEach((r) => by.set(r.category, [...(by.get(r.category) || []), Number(r.amount)]))
  const med = new Map([...by].map(([c, l]) => { const s = [...l].sort((a, b) => a - b); return [c, s[Math.floor(s.length / 2)]] }))
  return new Set(rows.filter((r) => by.get(r.category).length >= 4 && Number(r.amount) >= 1000 && Number(r.amount) > 3 * med.get(r.category)).map((r) => r.id))
}
