// The SBMA mark: the name in bold on a teal tile, with a small medical + above it.
export function Mark({ size = 44, id = 'm' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="SBMA">
      <defs><linearGradient id={'lg' + id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0b5f58" /><stop offset="1" stopColor="#2dd4bf" /></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill={'url(#lg' + id + ')'} />
      <rect x="30" y="11" width="4" height="13" rx="1.6" fill="#fff" />
      <rect x="25.5" y="15.5" width="13" height="4" rx="1.6" fill="#fff" />
      <text x="32" y="46.5" textAnchor="middle" fill="#fff" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="19" letterSpacing="0.4">SBMA</text>
    </svg>
  )
}
