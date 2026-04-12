/**
 * stellar.ts — Real Stellar Horizon helpers (no mock data)
 */

export const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org'
export const STELLAR_EXPERT_TESTNET = 'https://stellar.expert/explorer/testnet'
export const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

export function truncateAddress(address: string, chars = 6): string {
  if (!address) return ''
  return `${address.slice(0, chars)}...${address.slice(-4)}`
}

export function truncateHash(hash: string, chars = 8): string {
  if (!hash) return ''
  return `${hash.slice(0, chars)}...${hash.slice(-6)}`
}

export function explorerTxUrl(hash: string): string {
  return `${STELLAR_EXPERT_TESTNET}/tx/${hash}`
}

export function explorerAccountUrl(address: string): string {
  return `${STELLAR_EXPERT_TESTNET}/account/${address}`
}

export function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Fetch live server stats from the /health endpoint.
 * Uses a relative path so Vite proxy handles it in dev,
 * and VITE_SERVER_URL handles it in production.
 */
export async function fetchServerStats(serverUrl = '') {
  try {
    const res = await fetch(`${serverUrl}/health`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
