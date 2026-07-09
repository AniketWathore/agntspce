import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage, ChatModelInfo, StreamChunk, ProviderId } from '../types'

interface Props {
  onClose: () => void
  onNavigateToSettings?: () => void
  socket: {
    chatGetModels: () => Promise<ChatModelInfo[]>
    chatSendStream: (threadId: string, providerId: string, content: string) => void
    chatStopStream: (threadId: string) => void
    chatGetHistory: (threadId: string) => Promise<{ threadId: string; messages: ChatMessage[] }>
    chatUpdateApiKey: (providerId: string, apiKey: string) => void
    chatDeleteThread: (threadId: string) => void
    onChatStreamChunk: (cb: (data: StreamChunk) => void) => () => void
    onChatResponse: (cb: (data: { threadId: string; message: ChatMessage }) => void) => () => void
    onChatError: (cb: (data: { threadId: string; error: string }) => void) => () => void
  }
}

const SUGGESTIONS = [
  'How do I create a new workspace?',
  'Show me token reduction stats',
  'Help me debug an agent session',
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export default function ChatSidebar({ onClose, onNavigateToSettings, socket }: Props) {
  const [models, setModels] = useState<ChatModelInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openai')
  const [threadId, setThreadId] = useState<string>(() => generateId())
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const anyConfigured = models.some(m => m.configured)

  useEffect(() => {
    const load = async () => {
      const m = await socket.chatGetModels()
      setModels(m)
      const configured = m.find(p => p.configured)
      if (configured) setSelectedProvider(configured.id)
      setLoading(false)
    }
    load()
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const unsubStream = socket.onChatStreamChunk((chunk: StreamChunk) => {
      if (chunk.threadId !== threadId) return
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk.content,
          }
          if (chunk.done) {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              streaming: false,
            }
            setStreaming(false)
          }
          return updated
        }
        return prev
      })
    })

    const unsubResp = socket.onChatResponse((data: { threadId: string; message: ChatMessage }) => {
      if (data.threadId !== threadId) return
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          const updated = [...prev]
          updated[updated.length - 1] = { ...data.message, streaming: false }
          setStreaming(false)
          return updated
        }
        setStreaming(false)
        return [...prev, { ...data.message, streaming: false }]
      })
    })

    const unsubErr = socket.onChatError((data: { threadId: string; error: string }) => {
      if (data.threadId !== threadId) return
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          const updated = [...prev]
          updated[updated.length - 1] = { ...last, content: data.error, streaming: false, error: true }
          setStreaming(false)
          return updated
        }
        setStreaming(false)
        return [...prev, { id: generateId(), role: 'assistant', content: data.error, timestamp: Date.now(), error: true }]
      })
    })

    return () => {
      unsubStream()
      unsubResp()
      unsubErr()
    }
  }, [socket, threadId])

  useEffect(() => {
    const loadHistory = async () => {
      const data = await socket.chatGetHistory(threadId)
      setMessages(data.messages)
    }
    loadHistory()
  }, [socket, threadId])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      provider: selectedProvider,
    }
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      provider: selectedProvider,
    }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    socket.chatSendStream(threadId, selectedProvider, text)
  }, [input, streaming, selectedProvider, threadId, socket])

  const handleStop = useCallback(() => {
    socket.chatStopStream(threadId)
    setStreaming(false)
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        const updated = [...prev]
        updated[updated.length - 1] = { ...last, streaming: false }
        return updated
      }
      return prev
    })
  }, [socket, threadId])

  const handleNewChat = useCallback(() => {
    const newId = generateId()
    setThreadId(newId)
    setMessages([])
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside className="chat-sidebar">
      <div className="chat-header">
        <div className="chat-header-left">
          <i className="codicon codicon-comment-discussion" style={{ fontSize: 16 }}></i>
          <span className="chat-header-title">Assistant</span>
        </div>
        <div className="chat-header-actions">
          <button className="chat-header-btn" onClick={handleNewChat} title="New chat">
            <i className="codicon codicon-add" style={{ fontSize: 14 }}></i>
          </button>
          <button className="chat-close-btn" onClick={onClose} title="Close">
            <i className="codicon codicon-close" style={{ fontSize: 14 }}></i>
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">Loading models...</div>
        ) : messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <i className="codicon codicon-comment-discussion" style={{ fontSize: 32 }}></i>
            </div>
            {anyConfigured ? (
              <>
                <div className="chat-welcome-text">
                  Ask me anything about your workspace, agents, or code.
                </div>
                <div className="chat-suggestions">
                  <div className="chat-suggestions-label">Try asking:</div>
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      className="chat-suggestion-btn"
                      onClick={() => {
                        const userMsg: ChatMessage = {
                          id: generateId(),
                          role: 'user',
                          content: s,
                          timestamp: Date.now(),
                          provider: selectedProvider,
                        }
                        const assistantMsg: ChatMessage = {
                          id: generateId(),
                          role: 'assistant',
                          content: '',
                          timestamp: Date.now(),
                          streaming: true,
                          provider: selectedProvider,
                        }
                        setMessages([userMsg, assistantMsg])
                        setStreaming(true)
                        socket.chatSendStream(threadId, selectedProvider, s)
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="chat-welcome-setup">
                <div className="chat-welcome-text">
                  Setup API keys for chatting{' '}
                  <button
                    className="chat-welcome-link"
                    onClick={() => onNavigateToSettings?.()}
                  >
                    here
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`chat-msg ${msg.role}${msg.error ? ' chat-msg-error' : ''}`}>
                <div className="chat-msg-avatar">
                  <i className={`codicon ${msg.role === 'assistant' ? 'codicon-robot' : 'codicon-person'}`} style={{ fontSize: 14 }}></i>
                </div>
                <div className="chat-msg-content">
                  <div className="chat-msg-sender">
                    {msg.role === 'assistant' ? 'Assistant' : 'You'}
                    {msg.provider && <span className="chat-msg-provider"> via {msg.provider}</span>}
                  </div>
                  <div className="chat-msg-text">
                    {msg.content || (msg.streaming ? <span className="chat-cursor">|</span> : '')}
                    {msg.streaming && msg.content && <span className="chat-cursor">|</span>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          className="chat-input"
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
        {streaming ? (
          <button className="chat-stop-btn" onClick={handleStop}>
            <i className="codicon codicon-debug-stop" style={{ fontSize: 14 }}></i>
            Stop
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            Send
          </button>
        )}
      </div>
    </aside>
  )
}
