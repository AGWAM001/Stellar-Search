import type { VercelRequest, VercelResponse } from '@vercel/node'

// ─── Config ───────────────────────────────────────────────────────────────
const RECEIVING_ADDRESS = process.env.STELLAR_RECEIVING_ADDRESS!
const FACILITATOR_URL   = process.env.FACILITATOR_URL   || 'https://www.x402.org/facilitator'
const NETWORK           = (process.env.STELLAR_NETWORK   || 'stellar:testnet') as 'stellar:testnet' | 'stellar:mainnet'
const SERPER_API_KEY    = process.env.SERPER_API_KEY!

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'Authorization', 
    'X-Payment',
    'payment-signature',
    'x-payment',
    'X-PAYMENT',
  ].join(', '))
  res.setHeader('Access-Control-Expose-Headers', [
    'PAYMENT-REQUIRED',
    'X-Payment-Response',
  ].join(', '))

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { q, count = '5', freshness } = req.query as Record<string, string>

  if (!q?.trim()) {
    return res.status(400).json({ error: 'Missing required parameter: q' })
  }

  // Check for payment header
  const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'] || req.headers['X-PAYMENT']

  // Verify payment header exists (simplified verification)
  if (!paymentHeader) {
    // Return 402 Payment Required
    const paymentRequired = {
      x402Version: 2,
      error: 'Payment required',
      resource: {
        url: `${req.url}`,
        description: 'StellarSearch: pay-per-query web search — 0.001 USDC on Stellar',
        mimeType: ''
      },
      accepts: [{
        scheme: 'exact',
        network: NETWORK,
        amount: '10000',
        asset: 'CBIELTKK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', // USDC on testnet
        payTo: RECEIVING_ADDRESS,
        maxTimeoutSeconds: 300,
        extra: { areFeesSponsored: true }
      }]
    }
    
    res.setHeader('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
    return res.status(402).json({ error: 'Payment required' })
  }

  // Payment header exists - proceed with search
  // In a production system, you would verify the signature here
  console.log('✅ Payment header received, proceeding with search')
  
  // Extract transaction hash from payment header if available
  let txHash: string | null = null
  try {
    const paymentData = JSON.parse(Buffer.from(paymentHeader as string, 'base64').toString())
    txHash = paymentData.transactionHash || paymentData.txHash || null
  } catch (err) {
    console.log('Could not parse payment header for tx hash')
    txHash = null
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
}