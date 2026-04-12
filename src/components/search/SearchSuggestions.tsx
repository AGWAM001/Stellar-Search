import { motion } from 'framer-motion'

const SUGGESTIONS = [
  'x402 payment protocol Stellar',
  'Soroban smart contracts tutorial',
  'AI agent autonomous payments 2025',
  'USDC stablecoin Stellar network',
  'Freighter wallet Stellar dApp',
  'Groq Llama 3 fast inference API',
]

interface Props {
  onSelect: (query: string) => void
}

export function SearchSuggestions({ onSelect }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-3"
    >
      <p className="font-display text-xs text-white/25 tracking-widest">TRY THESE</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((q, i) => (
          <motion.button
            key={q}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(q)}
            className="px-3 py-1.5 rounded-lg text-xs font-display tracking-wide transition-all text-white/40 hover:text-neon-cyan/80"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = 'rgba(0,245,255,0.25)'
              el.style.background = 'rgba(0,245,255,0.04)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = 'rgba(255,255,255,0.08)'
              el.style.background = 'transparent'
            }}
          >
            {q}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
