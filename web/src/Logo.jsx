export function Mark({ size = 44, id = 'm' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id={'lg' + id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0b5f58" /><stop offset="1" stopColor="#2dd4bf" /></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill={'url(#lg' + id + ')'} />
      <rect x="26" y="14" width="12" height="36" rx="4" fill="#fff" />
      <rect x="14" y="26" width="36" height="12" rx="4" fill="#fff" />
    </svg>
  )
}
