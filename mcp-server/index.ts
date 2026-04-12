#!/usr/bin/env node
/**
 * StellarSearch MCP Server
 *
 * Exposes tools for Claude Code (and any MCP client):
 *   - web_search:       pays 0.001 USDC via x402, returns Serper.dev results
 *   - ai_summarize:     uses Groq to summarise search results
 *   - check_balance:    reads live USDC balance from Stellar Horizon
 *
 * Setup: see README.md → "Claude Code / MCP Integration"
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import Groq from 'groq-sdk'
import dotenv from 'dotenv'

dotenv.config()

const SERVER_URL = process.env.SEARCH_API_URL || 'http://localhost:3001'
const GROQ_API_KEY = process.env.GROQ_API_KEY!
const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

const groq = new Groq({ apiKey: GROQ_API_KEY })

// ─── MCP server ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'stellar-search', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'web_search',
      description: `Search the web via StellarSearch. Automatically pays 0.001 USDC on Stellar (x402 protocol).
The server handles the full payment flow: HTTP 402 → sign Soroban auth → settle → return results.
Use for current events, documentation, research, or anything needing up-to-date web information.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Results count (1–10, default 5)', default: 5 },
          freshness: { type: 'string', enum: ['pd', 'pw', 'pm'], description: 'Age: pd=day, pw=week, pm=month' },
        },
        required: ['query'],
      },
    },
    {
      name: 'ai_summarize',
      description: 'Use Groq (Llama 3) to summarise or analyse text. Free — no payment required.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to summarise or analyse' },
          instruction: { type: 'string', description: 'What to do with the text (e.g. "summarise", "extract key points")', default: 'summarise' },
        },
        required: ['text'],
      },
    },
    {
      name: 'check_balance',
      description: 'Check live USDC and XLM balance for a Stellar address from Horizon.',
      inputSchema: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Stellar public key (G...)' },
        },
        required: ['address'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  // ── web_search ────────────────────────────────────────────────────────
  if (name === 'web_search') {
    const { query, count = 5, freshness } = args as { query: string; count?: number; freshness?: string }

    try {
      const params = new URLSearchParams({ q: query, count: String(count) })
      if (freshness) params.set('freshness', freshness)

      // The server's x402 middleware handles the full payment flow.
      // In server-to-server mode the server needs a funded Stellar key.
      // For MCP usage we call the server which itself holds the paying wallet.
      const res = await fetch(`${SERVER_URL}/search?${params}`)

      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const formatted = data.results
        .map((r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`)
        .join('\n\n')

      return {
        content: [{
          type: 'text',
          text: [
            `🔍 Results for: "${query}"`,
            `💰 Paid: ${data.paidAmount} ${data.currency} on ${data.network}`,
            `⚡ Latency: ${data.latencyMs}ms`,
            `📊 ${data.count} results\n`,
            formatted,
          ].join('\n'),
        }],
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Search failed: ${err.message}` }], isError: true }
    }
  }

  // ── ai_summarize ──────────────────────────────────────────────────────
  if (name === 'ai_summarize') {
    const { text, instruction = 'summarise' } = args as { text: string; instruction?: string }

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a concise research assistant. Be brief and accurate.' },
          { role: 'user', content: `Please ${instruction} the following:\n\n${text}` },
        ],
        max_tokens: 512,
        temperature: 0.5,
      })

      const content = completion.choices[0]?.message?.content || 'No response.'
      return { content: [{ type: 'text', text: content }] }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Groq error: ${err.message}` }], isError: true }
    }
  }

  // ── check_balance ─────────────────────────────────────────────────────
  if (name === 'check_balance') {
    const { address } = args as { address: string }

    try {
      const res = await fetch(`${HORIZON_URL}/accounts/${address}`)
      if (res.status === 404) throw new Error('Account not found on Stellar testnet')
      if (!res.ok) throw new Error(`Horizon returned ${res.status}`)

      const account = await res.json()
      let xlm = '0', usdc = '0'

      for (const b of account.balances) {
        if (b.asset_type === 'native') xlm = parseFloat(b.balance).toFixed(4)
        if (b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === USDC_ISSUER) {
          usdc = parseFloat(b.balance).toFixed(6)
        }
      }

      const queries = Math.floor(parseFloat(usdc) / 0.001)
      return {
        content: [{
          type: 'text',
          text: [
            `💳 Stellar Account: ${address}`,
            `   USDC: ${usdc} (~${queries.toLocaleString()} searches remaining)`,
            `   XLM:  ${xlm}`,
            `   Network: testnet`,
            `   Explorer: https://stellar.expert/explorer/testnet/account/${address}`,
          ].join('\n'),
        }],
      }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Balance check failed: ${err.message}` }], isError: true }
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('StellarSearch MCP server started')
