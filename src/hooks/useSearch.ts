/**
 * useSearch.ts
 * Fixed x402 + Freighter payment flow.
 *
 * KEY INSIGHT from Stellar docs:
 * Freighter's signAuthEntry() returns a BUFFER (raw bytes of the signed hash).
 * ExactStellarScheme expects signedAuthEntry as a base64 string of those raw bytes.
 * The previous code was calling .toString() which gives "[object Buffer]" — 9 chars —
 * hence "signature of length 64 expected, got 9".
 * Fix: convert Buffer → base64 string using Buffer.from(result).toString('base64')
 */

import { useState, useCallback }              from 'react'
import { x402Client, x402HTTPClient }          from '@x402/fetch'
import { ExactStellarScheme }                  from '@x402/stellar/exact/client'
import { signAuthEntry, getNetworkDetails }    from '@stellar/freighter-api'
import { Networks }                            from '@stellar/stellar-sdk'
import { Buffer }                              from 'buffer'

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ?? (
  typeof window !== 'undefined' && window.location.origin.includes('vercel.app') 
    ? `${window.location.origin}/api`
    : 'http://localhost:3001'
)
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org'

export interface SearchResult {
  id: string
  title: string
  url: string
  description: string
  source: string
  relevanceScore: number
  publishedAt?: string
}

export interface SearchSession {
  query: string
  results: SearchResult[]
  txHash: string | null
  paidAmount: string | null
  status: 'idle' | 'searching' | 'complete' | 'error'
  error?: string
  durationMs?: number
  suggestions: string[]
}

export function useSearch(walletAddress: string | null = null) {
  const [session, setSession] = useState<SearchSession>({
    query: '', results: [], txHash: null, paidAmount: null, status: 'idle', suggestions: [],
  })

  const search = useCallback(async (query: string, count = 5) => {
    if (!query.trim()) return

    setSession({ query, results: [], txHash: null, paidAmount: null, status: 'searching', suggestions: [] })

    const t0     = Date.now()
    const params = new URLSearchParams({ q: query, count: String(count), suggestions: '1' })

    try {
      if (!walletAddress) throw new Error('Connect your Freighter wallet first.')

      console.log('🔍 Starting search with wallet:', walletAddress)

      // Step 1 — verify Freighter is on Testnet
      const net = await getNetworkDetails()
      if (net.error)              throw new Error(net.error.message)
      if (net.network !== 'TESTNET') throw new Error(`Switch Freighter to Testnet. Currently: ${net.network}`)
      console.log('✅ Network verified:', net.network)

      // Step 2 — build the signer
      // Freighter.signAuthEntry() returns a RAW BUFFER (64 bytes of ed25519 signature).
      // ExactStellarScheme.signAuthEntry must return { signedAuthEntry: string }
      // where signedAuthEntry is that buffer encoded as BASE64 — not .toString() which
      // gives "[object Buffer]" (9 chars) and causes "expected 64 got 9".
      const signer = {
        address: walletAddress,
        signAuthEntry: async (
          xdr: string,
          opts?: { networkPassphrase?: string }
        ): Promise<{ signedAuthEntry: string; signerAddress: string }> => {
          console.log('🔑 Calling Freighter signAuthEntry...')

          const result = await signAuthEntry(xdr, {
            networkPassphrase: opts?.networkPassphrase ?? Networks.TESTNET,
          })

          if (result.error) throw new Error(result.error.message)
          if (!result.signedAuthEntry) throw new Error('Freighter returned no signedAuthEntry')

          console.log('✅ Freighter signed. Type:', typeof result.signedAuthEntry)

          // Freighter returns a Buffer. Convert it correctly to base64.
          // Using Buffer.from() handles both Buffer and Uint8Array safely.
          const raw = result.signedAuthEntry
          const signedAuthEntry = typeof raw === 'string'
            ? raw  // already a base64 string in newer Freighter versions
            : Buffer.from(raw as unknown as Uint8Array).toString('base64')

          console.log('✅ signedAuthEntry base64 length:', signedAuthEntry.length)

          return { signedAuthEntry, signerAddress: walletAddress }
        },
      }

      // Step 3 — build the x402 client with correct .register() chain
      const client     = new x402Client().register(
        'stellar:*',
        new ExactStellarScheme(signer, { url: SOROBAN_RPC_URL })
      )
      const httpClient = new x402HTTPClient(client)
      console.log('✅ x402 client built')

      // Step 4 — initial request, expect 402
      console.log('🚀 Initial request:', `${SERVER_URL}/search?${params}`)
      const firstRes = await fetch(`${SERVER_URL}/search?${params}`)
      console.log('📡 Status:', firstRes.status)

      if (firstRes.status !== 402) {
        if (!firstRes.ok) throw new Error(`Server error ${firstRes.status}`)
        const data = await firstRes.json()
        return setSession({
          query, results: data.results ?? [], txHash: null,
          paidAmount: null, status: 'complete', durationMs: Date.now() - t0, suggestions: data.suggestions ?? [],
        })
      }

      // Step 5 — parse the PAYMENT-REQUIRED header
      console.log('💰 402 received, parsing payment requirements...')
      const paymentRequired = httpClient.getPaymentRequiredResponse(
        (name) => firstRes.headers.get(name)
      )
      console.log('💰 Payment requirements:', paymentRequired)

      // Step 6 — createPaymentPayload() triggers the Freighter popup
      console.log('🔐 Triggering Freighter popup via createPaymentPayload...')
      const paymentPayload = await client.createPaymentPayload(paymentRequired)
      console.log('✅ Freighter approved, payload created')

      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload)
      console.log('✅ Payment headers encoded')

      // Step 7 — retry with X-PAYMENT header
      console.log('🔄 Retrying with payment...')
      const paidRes = await fetch(`${SERVER_URL}/search?${params}`, {
        headers: paymentHeaders,
      })
      console.log('📡 Paid response status:', paidRes.status)

      if (!paidRes.ok) {
        const text = await paidRes.text()
        throw new Error(`Payment failed: server returned ${paidRes.status} — ${text}`)
      }

      const data = await paidRes.json()
      console.log('✅ Search complete!')

      setSession({
        query,
        results:     data.results    ?? [],
        txHash:      data.txHash     ?? null,
        paidAmount:  data.paidAmount ?? null,
        status:      'complete',
        durationMs:  Date.now() - t0,
        suggestions: data.suggestions ?? [],
      })

    } catch (err: any) {
      console.error('❌ Search failed:', err)
      setSession(prev => ({
        ...prev,
        status: 'error',
        error:  err.message || 'Search failed.',
      }))
    }
  }, [walletAddress])

  const reset = useCallback(() => {
    setSession({ query: '', results: [], txHash: null, paidAmount: null, status: 'idle', suggestions: [] })
  }, [])

  return { session, search, reset }
}