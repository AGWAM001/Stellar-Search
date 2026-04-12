import type { VercelRequest, VercelResponse } from '@vercel/node'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Groq from 'groq-sdk'
import { paymentMiddlewareFromConfig } from '@x402/express'
import { ExactStellarScheme } from '@x402/stellar/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'

dotenv.config()

// ─── Config ───────────────────────────────────────────────────────────────
const RECEIVING_ADDRESS = process.env.STELLAR_RECEIVING_ADDRESS!
const FACILITATOR_URL   = process.env.FACILITATOR_URL   || 'https://www.x402.org/facilitator'
const NETWORK           = (process.env.STELLAR_NETWORK   || 'stellar:testnet') as 'stellar:testnet' | 'stellar:mainnet'
const SERPER_API_KEY    = process.env.SERPER_API_KEY!

// ─── x402 payment guard ──────────────────────────────────────────────────
const x402Routes = {
  'GET /api/search': {
    accepts: [{
      scheme:  'exact',
      price:   0.001,
      amount:  '10000',
      network: NETWORK,
      payTo:   RECEIVING_ADDRESS,
    }],
    description: 'StellarSearch: pay-per-query web search — 0.001 USDC on Stellar',
  },
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL })
const schemes = [{ network: NETWORK, server: new ExactStellarScheme() }]

// Create Express app for this endpoint
const app = express()

app.use(cors({
  origin: '*',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Payment',
    'payment-signature',
    'x-payment',
    'X-PAYMENT',
  ],
  exposedHeaders: [
    'PAYMENT-REQUIRED',
    'X-Payment-Response',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}))

// Apply x402 middleware
app.use(paymentMiddlewareFromConfig(x402Routes, facilitatorClient, schemes))

// Search endpoint
app.get('/api/search', async (req, res) => {
  const { q, count = '5', freshness } = req.query as Record<string, string>

  if (!q?.trim()) {
    return res.status(400).json({ error: 'Missing required parameter: q' })
  }

  const t0 = Date.now()

  try {
    const requestBody: any = {
      q: q.trim(),
      num: Math.min(parseInt(count) || 5, 20),
    }

    // Add freshness filter if provided
    if (freshness) {
      const dateFilters: Record<string, string> = {
        'pd': 'qdr:d',  // past day
        'pw': 'qdr:w',  // past week
        'pm': 'qdr:m',  // past month
      }
      if (dateFilters[freshness]) {
        requestBody.tbs = dateFilters[freshness]
      }
    }

    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!serperRes.ok) {
      const err = await serperRes.text()
      console.error('[serper]', serperRes.status, err)
      return res.status(502).json({ error: `Serper.dev API error: ${serperRes.status}` })
    }

    const data = await serperRes.json()
    const latencyMs = Date.now() - t0

    const results = (data.organic || []).map((r: any, i: number) => ({
      id: String(i + 1),
      title: r.title || 'No title',
      url: r.link,
      description: r.snippet || '',
      source: (() => { try { return new URL(r.link).hostname.replace('www.', '') } catch { return r.link } })(),
      relevanceScore: Math.max(0.5, 1 - i * 0.06),
      publishedAt: r.date || undefined,
    }))

    // The real tx hash comes from the X-PAYMENT-RESPONSE header set by the facilitator
    const txHash = (req.headers['x-payment-response'] as string) || null

    return res.json({
      query: q.trim(),
      results,
      count: results.length,
      network: NETWORK,
      paidAmount: '0.001',
      currency: 'USDC',
      txHash,
      latencyMs,
    })
  } catch (err: any) {
    console.error('[search error]', err.message)
    return res.status(500).json({ error: 'Search failed. Check server logs.' })
  }
})

// Export for Vercel
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res)
}