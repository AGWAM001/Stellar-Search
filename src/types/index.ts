import type { SearchResult, SearchSession } from '../hooks/useSearch'
import type { WalletState, StellarTransaction } from '../hooks/useFreighterWallet'

export type { WalletState, StellarTransaction, SearchResult, SearchSession }

export interface ApiStat {
  totalQueries: number
  totalUsdcSettled: string
  avgLatencyMs: number
  uptime: string
}

export interface ImageResult {
  id: string
  title: string
  imageUrl: string
  thumbnailUrl: string
  sourceUrl: string
  source: string
  width?: number
  height?: number
}

export interface NewsResult {
  id: string
  title: string
  url: string
  snippet: string
  source: string
  publishedAt?: string
  imageUrl?: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
  network: string
  paidAmount: string
  currency: string
  txHash: string | null
  latencyMs: number
  suggestions?: string[]
}

export interface ImageSearchResponse {
  query: string
  results: ImageResult[]
  count: number
  network: string
  paidAmount: string
  currency: string
  txHash: string | null
  latencyMs: number
}

export interface NewsSearchResponse {
  query: string
  results: NewsResult[]
  count: number
  network: string
  paidAmount: string
  currency: string
  txHash: string | null
  latencyMs: number
}

export interface ApiErrorResponse {
  error: string
}
