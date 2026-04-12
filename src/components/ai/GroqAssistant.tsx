import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Send, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_INTRO: Message = {
  role: 'assistant',
  content:
    "Hi! I'm your AI research assistant powered by Groq (Llama 3). I can help you craft better search queries, summarise results, or explain topics. Each search costs 0.001 USDC on Stellar. What would you like to research?",
}

export function GroqAssistant() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([SYSTEM_INTRO])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Could not reach AI server: ${err.message}. Make sure the backend is running with GROQ_API_KEY set.`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(0,245,255,0.15)', border: '1px solid rgba(0,245,255,0.4)' }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          boxShadow: [
            '0 0 15px rgba(0,245,255,0.3)',
            '0 0 35px rgba(0,245,255,0.6)',
            '0 0 15px rgba(0,245,255,0.3)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Bot className="w-5 h-5 text-neon-cyan" />
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-6 z-40 w-80 rounded-2xl overflow-hidden flex flex-col"
            style={{
              height: '420px',
              background: 'rgba(6,13,20,0.96)',
              border: '1px solid rgba(0,245,255,0.2)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-neon-cyan" />
                <span className="font-display text-xs text-neon-cyan tracking-wider">GROQ AI</span>
                <span className="font-display text-xs text-white/25 hidden sm:inline">· Llama 3</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                    style={{
                      background: msg.role === 'user'
                        ? 'rgba(0,245,255,0.15)'
                        : 'rgba(255,255,255,0.05)',
                      border: msg.role === 'user'
                        ? '1px solid rgba(0,245,255,0.3)'
                        : '1px solid rgba(255,255,255,0.07)',
                      color: msg.role === 'user' ? '#00f5ff' : 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/7">
                    {[0, 1, 2].map(j => (
                      <motion.div
                        key={j}
                        className="w-1.5 h-1.5 rounded-full bg-neon-cyan/60"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: j * 0.15 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask anything..."
                  disabled={loading}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-neon-cyan/30 disabled:opacity-50"
                  style={{ caretColor: '#00f5ff' }}
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{
                    background: 'rgba(0,245,255,0.15)',
                    border: '1px solid rgba(0,245,255,0.3)',
                  }}
                >
                  <Send className="w-3.5 h-3.5 text-neon-cyan" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
