// The SBMA mark: a medical cross on a teal tile, with the name underneath.
export function Mark({ size = 44, id = 'm' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="SBMA">
      <defs><linearGradient id={'lg' + id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0b5f58" /><stop offset="1" stopColor="#2dd4bf" /></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill={'url(#lg' + id + ')'} />
      <rect x="26.5" y="8" width="11" height="34" rx="3.5" fill="#fff" />
      <rect x="15" y="19.5" width="34" height="11" rx="3.5" fill="#fff" />
      <text x="32" y="57" textAnchor="middle" fill="#fff" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="10.5" letterSpacing="1.6">SBMA</text>
    </svg>
  )
}
