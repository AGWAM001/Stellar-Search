import { motion } from 'framer-motion'
import { ExternalLink, Star, Clock } from 'lucide-react'
import type { SearchResult } from '../../hooks/useSearch'

interface Props {
  results: SearchResult[]
  query: string
}

export function SearchResults({ results }: Props) {
  if (!results.length) return null

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-xs text-white/35 tracking-widest">
          {results.length} RESULTS · SERPER.DEV · PAID VIA x402
        </p>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-green" />
          <span className="font-display text-xs text-neon-green/70">LIVE</span>
        </div>
      </div>

      {results.map((r, i) => (
        <motion.a
          key={r.id}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="block group rounded-xl p-4 hover:border-neon-cyan/25 transition-all"
          style={{
            background: 'rgba(6,13,20,0.6)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Source + score */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className="inline-flex items-center py-0.5 px-2 rounded-full font-display border"
                  style={{
                    background: 'rgba(0,245,255,0.08)',
                    borderColor: 'rgba(0,245,255,0.2)',
                    color: '#00f5ff',
                    fontSize: '10px',
                  }}
                >
                  {r.source}
                </span>
                <div className="flex items-center gap-1 text-neon-amber/60">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="font-display text-xs">{(r.relevanceScore * 100).toFixed(0)}%</span>
                </div>
                {r.publishedAt && (
                  <div className="flex items-center gap-1 text-white/25">
                    <Clock className="w-3 h-3" />
                    <span className="font-display text-xs">{r.publishedAt}</span>
                  </div>
                )}
              </div>

              <h3 className="text-white font-medium text-sm leading-snug mb-1 group-hover:text-neon-cyan transition-colors">
                {r.title}
              </h3>

              <p className="font-mono text-xs mb-2 truncate" style={{ color: 'rgba(0,245,255,0.35)' }}>
                {r.url}
              </p>

              <p className="text-white/45 text-xs leading-relaxed line-clamp-2">
                {r.description}
              </p>
            </div>

            <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border border-white/8 text-white/25 group-hover:text-neon-cyan group-hover:border-neon-cyan/30 transition-all mt-0.5">
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Relevance bar */}
          <div className="mt-3 h-px bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${r.relevanceScore * 100}%` }}
              transition={{ delay: i * 0.06 + 0.3, duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, rgba(0,245,255,0.6), rgba(0,245,255,0.15))' }}
            />
          </div>
        </motion.a>
      ))}
    </motion.div>
  )
}
