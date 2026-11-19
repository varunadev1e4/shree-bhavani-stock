import { createClient } from '@supabase/supabase-js'

// Never more than 4 requests at once, and none can hang forever (a stuck request used to block the rest).
let active = 0
const queue = []
const pump = () => { while (active < 4 && queue.length) { active++; queue.shift()() } }
const limitedFetch = (url, opts = {}) => new Promise((resolve, reject) => {
  queue.push(() => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 30000)
    if (opts.signal) opts.signal.addEventListener('abort', () => ctl.abort())
    fetch(url, { ...opts, signal: ctl.signal })
      .then(resolve, reject)
      .finally(() => { clearTimeout(timer); active--; pump() })
  })
  pump()
})

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: limitedFetch }, auth: { lock: (name, timeout, fn) => fn() } }
)