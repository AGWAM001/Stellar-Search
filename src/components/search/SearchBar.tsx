import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Zap } from 'lucide-react'

interface Props {
  onSearch: (query: string) => void
  isSearching: boolean
  walletConnected: boolean
  usdcBalance: string
  defaultQuery?: string
}

export function SearchBar({
  onSearch, isSearching, walletConnected, usdcBalance, defaultQuery = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value.trim()
    if (q) onSearch(q)
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative group">
        {/* Glow ring on focus */}
        <div
          className="absolute -inset-px rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm"
          style={{ background: 'linear-gradient(135deg, rgba(0,245,255,0.2), rgba(14,165,233,0.2), rgba(0,245,255,0.2))' }}
        />

        <div
          className="relative flex items-center gap-3 px-5 py-4 rounded-2xl"
          style={{
            background: 'rgba(6,13,20,0.85)',
            border: '1px solid rgba(0,245,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: 'rgba(0,245,255,0.5)' }} />

          <input
            ref={inputRef}
            name="q"
            type="text"
            defaultValue={defaultQuery}
            placeholder="Search anything — pay per query, not per month..."
            disabled={isSearching}
            className="flex-1 bg-transparent text-white placeholder:text-white/20 text-sm outline-none disabled:opacity-50"
            style={{ caretColor: '#00f5ff' }}
          />

          <motion.button
            type="submit"
            disabled={isSearching}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-display text-xs tracking-wider transition-all disabled:opacity-40"
            style={{
              background: isSearching ? 'transparent' : 'rgba(0,245,255,0.12)',
              border: '1px solid',
              borderColor: isSearching ? 'rgba(255,255,255,0.1)' : 'rgba(0,245,255,0.4)',
              color: isSearching ? 'rgba(255,255,255,0.3)' : '#00f5ff',
            }}
            whileTap={{ scale: 0.96 }}
          >
            {isSearching ? (
              <motion.div
                className="w-3.5 h-3.5 rounded-full border border-neon-cyan/40 border-t-neon-cyan"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <><Zap className="w-3.5 h-3.5" /> 0.001 USDC</>
            )}
          </motion.button>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between mt-2 px-1">
        <p className="font-display text-xs text-white/20">
          {walletConnected
            ? `Balance: ${usdcBalance} USDC · ~${Math.floor(parseFloat(usdcBalance) / 0.001).toLocaleString()} queries left`
            : 'Connect Freighter wallet to search'}
        </p>
        <p className="font-display text-xs text-white/20">
          Serper.dev · x402 · Stellar Testnet
        </p>
      </div>
    </form>
  )
}
