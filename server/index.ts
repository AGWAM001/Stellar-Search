/**
 * StellarSearch Server
 * Real x402 payment middleware + Serper.dev Search + Groq AI
 *
 * Uses the CORRECT API per official Stellar x402 quickstart:
 *   paymentMiddlewareFromConfig() instead of paymentMiddleware()
 *   This is what the official docs and x402-stellar repo use.
 *
 * Packages:
 *   @x402/express  — paymentMiddlewareFromConfig
 *   @x402/stellar  — ExactStellarScheme (server)
 *   @x402/core     — HTTPFacilitatorClient
 *   groq-sdk       — Groq AI (Llama 3)
 */

import express, { Request, Response } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Groq from 'groq-sdk'
import { paymentMiddlewareFromConfig } from '@x402/express'
import { ExactStellarScheme } from '@x402/stellar/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { 
  STELLAR_NETWORK, 
  HORIZON_URL, 
  AMOUNT_USDC, 
  AMOUNT_STROOPS 
} from '../src/lib/constants'

dotenv.config()

const app  = express()
const PORT = process.env.PORT || 3001

// ─── In-memory stats ──────────────────────────────────────────────────────
const stats = {
  totalQueries: 0,
  totalUsdcSettled: 0,
  latencies: [] as number[],
  startTime: Date.now(),
}

// ─── Config ───────────────────────────────────────────────────────────────
const RECEIVING_ADDRESS = process.env.STELLAR_RECEIVING_ADDRESS!
const FACILITATOR_URL   = process.env.FACILITATOR_URL   || 'https://www.x402.org/facilitator'
const NETWORK           = STELLAR_NETWORK as 'stellar:testnet' | 'stellar:mainnet'
const SERPER_API_KEY    = process.env.SERPER_API_KEY!
const GROQ_API_KEY      = process.env.GROQ_API_KEY!

if (!RECEIVING_ADDRESS) console.warn('⚠  STELLAR_RECEIVING_ADDRESS not set')
if (!SERPER_API_KEY)    console.warn('⚠  SERPER_API_KEY not set')
if (!GROQ_API_KEY)      console.warn('⚠  GROQ_API_KEY not set')

// ─── Groq ─────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: GROQ_API_KEY })

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Payment',
    'payment-signature',
    // ← this is what the browser is complaining about
    'x-payment',
    'X-PAYMENT',
  ],
  exposedHeaders: [
    'PAYMENT-REQUIRED',
    'X-Payment-Response',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}))
app.use(express.json())

// ─── x402 payment guard on /search ───────────────────────────────────────
// paymentMiddlewareFromConfig is the recommended API per official Stellar docs.
// It uses the Coinbase public facilitator (no API key needed for testnet).
const x402Routes = {
  'GET /search': {
    accepts: [{
      scheme:  'exact',
      price:   parseFloat(AMOUNT_USDC),
      amount:  AMOUNT_STROOPS,
      network: NETWORK,
      payTo:   RECEIVING_ADDRESS,
    }],
    description: `StellarSearch: pay-per-query web search — ${AMOUNT_USDC} USDC on Stellar`,
  },
}

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL })
const schemes = [{ network: NETWORK, server: new ExactStellarScheme() }]

// Apply middleware to all routes, not just /search
app.use(paymentMiddlewareFromConfig(x402Routes, facilitatorClient, schemes))

// ─── GET /search ──────────────────────────────────────────────────────────
app.get('/search', async (req: Request, res: Response) => {
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

    // Add freshness filter if provided (Serper supports date filters)
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

    stats.totalQueries++
    stats.totalUsdcSettled += 0.001
    stats.latencies.push(latencyMs)
    if (stats.latencies.length > 200) stats.latencies.shift()

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

    // ── Optional AI suggestions via Groq ──────────────────────────────────
    let suggestions: string[] = []
    if (req.query.suggestions === '1' && results.length > 0) {
      try {
        const topSnippets = results.slice(0, 3).map((r: any) => r.description).join(' | ')
        const suggCompletion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a search assistant. Given a query and top result snippets, return exactly 3 related search queries the user might want to explore next. Output only a JSON array of 3 strings, no explanation.',
            },
            {
              role: 'user',
              content: `Query: "${q.trim()}"\nTop results: ${topSnippets}`,
            },
          ],
          max_tokens: 120,
          temperature: 0.7,
        })
        const raw = suggCompletion.choices[0]?.message?.content || '[]'
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) suggestions = JSON.parse(match[0]).slice(0, 3)
      } catch (err: any) {
        console.warn('[suggestions] Groq error:', err.message)
      }
    }

    return res.json({
      query: q.trim(),
      results,
      count: results.length,
      network: NETWORK,
      paidAmount: AMOUNT_USDC,
      currency: 'USDC',
      txHash,
      latencyMs,
      suggestions,
    })
  } catch (err: any) {
    console.error('[search error]', err.message)
    return res.status(500).json({ error: 'Search failed. Check server logs.' })
  }
})

// ─── POST /ai/chat ────────────────────────────────────────────────────────
app.post('/ai/chat', async (req: Request, res: Response) => {
  const { messages } = req.body as {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  }

  if (!messages?.length) {
    return res.status(400).json({ error: 'messages array required' })
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content:
            'You are StellarSearch AI, a concise research assistant. Help users craft better search queries and understand results. Keep responses under 200 words.',
        },
        ...messages,
      ],
      max_tokens:  512,
      temperature: 0.7,
    })

    const content = completion.choices[0]?.message?.content || 'No response.'
    return res.json({ content, model: completion.model })
  } catch (err: any) {
    console.error('[groq error]', err.message)
    return res.status(500).json({ error: `Groq AI error: ${err.message}` })
  }
})

// ─── GET /health ──────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  const avg = stats.latencies.length
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0

  const up = Math.floor((Date.now() - stats.startTime) / 1000)
  const uptime = up < 60 ? `${up}s` : up < 3600 ? `${Math.floor(up / 60)}m` : `${Math.floor(up / 3600)}h`

  res.json({
    status:                    'ok',
    network:                   NETWORK,
    pricePerQuery:             '0.001 USDC',
    protocol:                  'x402',
    facilitator:               FACILITATOR_URL,
    totalQueries:              stats.totalQueries,
    totalUsdcSettled:          stats.totalUsdcSettled.toFixed(4),
    avgLatencyMs:              avg,
    uptime,
    serperApiConfigured:       !!SERPER_API_KEY,
    groqApiConfigured:         !!GROQ_API_KEY,
    receivingAddressConfigured: !!RECEIVING_ADDRESS,
  })
})

// ─── GET / ────────────────────────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name:        'StellarSearch',
    version:     '1.0.0',
    description: 'Pay-per-query web search for AI agents via x402 on Stellar',
    endpoints: {
      'GET /search?q=<query>': '0.001 USDC via x402',
      'POST /ai/chat':         'Groq AI — free',
      'GET /health':           'Live server stats',
    },
  })
})

// ─── Start ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`\n🚀 StellarSearch on http://localhost:${PORT}`)
    console.log(`   Network:     ${NETWORK}`)
    console.log(`   Facilitator: ${FACILITATOR_URL}`)
    console.log(`   Serper:      ${SERPER_API_KEY ? '✓' : '✗ MISSING'}`)
    console.log(`   Groq:        ${GROQ_API_KEY  ? '✓' : '✗ MISSING'}`)
    console.log(`   Receiving:   ${RECEIVING_ADDRESS || '✗ MISSING'}\n`)
  })
}

export default app
