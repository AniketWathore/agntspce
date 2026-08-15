import { useState, useEffect, useRef, useCallback } from 'react'
import useSocketEvent from '../hooks/useSocketEvent'
import type { ChatMessage, ChatModelInfo, ChatThread, StreamChunk } from '../types'

interface Props {
  onClose: () => void
  onNavigateToSettings?: () => void
  socket: {
    chatGetModels: () => Promise<ChatModelInfo[]>
    chatSendStream: (threadId: string, providerId: string, content: string, model?: string) => void
    chatStopStream: (threadId: string) => void
    chatGetHistory: (threadId: string) => Promise<{ threadId: string; messages: ChatMessage[] }>
    chatListThreads: () => Promise<ChatThread[]>
    chatCreateThread: (providerId: string, model: string) => Promise<ChatThread | null>
    chatRenameThread: (threadId: string, title: string) => void
    chatClearThread: (threadId: string) => void
    chatDeleteThread: (threadId: string) => void
    onChatStreamChunk: (cb: (data: StreamChunk) => void) => () => void
    onChatResponse: (cb: (data: { threadId: string; message: ChatMessage }) => void) => () => void
    onChatError: (cb: (data: { threadId: string; error: string }) => void) => () => void
    onChatThreads: (cb: (data: { threads: ChatThread[] }) => void) => () => void
  }
}

const SERVER_URL = 'http://127.0.0.1:9460'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function ChatSidebar({ onClose, onNavigateToSettings, socket }: Props) {
  const [providers, setProviders] = useState<ChatModelInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [threadId, setThreadId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const configured = providers.filter(p => p.configured && p.hasKey)
  const anyConfigured = configured.length > 0

  useEffect(() => {
    const load = async () => {
      try {
        const [m, t] = await Promise.all([socket.chatGetModels(), socket.chatListThreads()])
        setProviders(m)
        setThreads(t)
        const avail = m.filter(p => p.configured && p.hasKey)
        if (avail.length > 0) {
          const first = avail[0]
          setSelectedProvider(first.id)
          setSelectedModel(first.model)
          if (t.length > 0) {
            setThreadId(t[0].id)
          }
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [socket])

  useEffect(() => {
    if (!threadId) {
      setMessages([])
      return
    }
    const known = threads.some(t => t.id === threadId)
    if (!known) return
    socket.chatGetHistory(threadId).then(data => {
      setMessages(data?.messages || [])
    })
  }, [socket, threadId, threads])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (selectedProvider) {
      setLoading(false)
      fetch(`${SERVER_URL}/api/chat/models/${selectedProvider}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.models?.length) {
            const sorted = [...data.models].sort((a, b) => a.localeCompare(b))
            setModels(sorted)
            setSelectedModel(prev => (sorted.includes(prev) ? prev : sorted[0]))
          }
        })
        .catch(() => {})
    }
  }, [selectedProvider])

  useEffect(() => {
    if (loading || anyConfigured) return
    const id = setInterval(() => {
      socket.chatGetModels().then(m => setProviders(m))
    }, 2000)
    return () => clearInterval(id)
  }, [loading, anyConfigured, socket])

  useEffect(() => {
    if (!selectedProvider) {
      const avail = providers.filter(p => p.configured && p.hasKey)
      if (avail.length > 0) {
        const first = avail[0]
        setSelectedProvider(first.id)
        setSelectedModel(first.model)
        socket.chatListThreads().then(t => {
          setThreads(t)
          if (t.length > 0) setThreadId(t[0].id)
        })
      }
    }
  }, [providers, selectedProvider, socket])

  useSocketEvent<StreamChunk>(socket.onChatStreamChunk, (chunk) => {
    if (chunk.threadId !== threadId) return
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (chunk.done) {
        setStreaming(false)
        if (last?.role === 'assistant' && last.streaming) {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk.content,
            streaming: false,
          }
          return updated
        }
        return prev
      }
      if (last?.role === 'assistant' && last.streaming) {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...last,
          content: last.content + chunk.content,
        }
        return updated
      }
      return prev
    })
  }, [socket, threadId])

  useSocketEvent<{ threadId: string; message: ChatMessage }>(socket.onChatResponse, (data) => {
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
  }, [socket, threadId])

  useSocketEvent<{ threadId: string; error: string }>(socket.onChatError, (data) => {
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
  }, [socket, threadId])

  useSocketEvent<{ threads: ChatThread[] }>(socket.onChatThreads, (data) => {
    if (data?.threads) setThreads(data.threads)
  }, [socket])

  const refreshThreads = useCallback(() => {
    socket.chatListThreads().then(t => setThreads(t))
  }, [socket])

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
      model: selectedModel,
    }
    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      provider: selectedProvider,
      model: selectedModel,
    }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    let tid = threadId
    if (!tid) {
      tid = generateId()
      setThreadId(tid)
    }
    socket.chatSendStream(tid, selectedProvider, text, selectedModel)
  }, [input, streaming, selectedProvider, selectedModel, threadId, socket])

  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      refreshThreads()
    }
    prevStreamingRef.current = streaming
  }, [streaming, refreshThreads])

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
    if (streaming) socket.chatStopStream(threadId)
    setStreaming(false)
    setThreadId('')
    setMessages([])
    setShowHistory(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [socket, streaming, threadId])

  const selectThread = useCallback((id: string) => {
    if (streaming) socket.chatStopStream(threadId)
    setStreaming(false)
    setThreadId(id)
    setShowHistory(false)
  }, [socket, streaming, threadId])

  const deleteThread = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    socket.chatDeleteThread(id)
    if (threadId === id) {
      setThreadId('')
      setMessages([])
    }
  }, [socket, threadId])

  const clearThread = useCallback(() => {
    if (!threadId) return
    socket.chatClearThread(threadId)
    setMessages([])
  }, [socket, threadId])

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id)
    const p = providers.find(x => x.id === id)
    setSelectedModel(p?.model || '')
    setModels([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const renderMessage = (msg: ChatMessage, i: number) => (
    <div key={msg.id || i} className={`chat-msg ${msg.role}${msg.error ? ' chat-msg-error' : ''}`}>
      <div className="chat-msg-avatar">
        <i className={`codicon ${msg.role === 'assistant' ? 'codicon-robot' : 'codicon-person'}`} style={{ fontSize: 14 }}></i>
      </div>
      <div className="chat-msg-content">
        <div className="chat-msg-sender">
          {msg.role === 'assistant' ? 'Assistant' : 'You'}
          {msg.model && <span className="chat-msg-provider"> · {msg.model}</span>}
        </div>
        <div className="chat-msg-text">
          {msg.content || (msg.streaming ? <span className="chat-cursor">|</span> : '')}
          {msg.streaming && msg.content && <span className="chat-cursor">|</span>}
        </div>
      </div>
    </div>
  )

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
          <button
            className={`chat-header-btn${showHistory ? ' chat-header-btn-active' : ''}`}
            onClick={() => setShowHistory(s => !s)}
            title="Chat history"
          >
            <i className="codicon codicon-history" style={{ fontSize: 14 }}></i>
          </button>
          <button className="chat-close-btn" onClick={onClose} title="Close">
            <i className="codicon codicon-close" style={{ fontSize: 14 }}></i>
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="chat-history-panel">
          <div className="chat-history-header">Sessions</div>
          {threads.length === 0 ? (
            <div className="chat-history-empty">No sessions yet</div>
          ) : (
            <div className="chat-history-list">
              {threads.map(t => (
                <div
                  key={t.id}
                  className={`chat-history-item${t.id === threadId ? ' active' : ''}`}
                  onClick={() => selectThread(t.id)}
                >
                  <i className="codicon codicon-comment" style={{ fontSize: 13 }}></i>
                  <div className="chat-history-item-main">
                    <div className="chat-history-item-title">{t.title || 'New chat'}</div>
                    <div className="chat-history-item-meta">
                      <span>{t.providerId}</span>
                      {t.model && <span> · {t.model}</span>}
                      <span> · {formatTime(t.updatedAt)}</span>
                    </div>
                  </div>
                  <button className="chat-history-item-del" onClick={(e) => deleteThread(t.id, e)} title="Delete">
                    <i className="codicon codicon-trash" style={{ fontSize: 12 }}></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="chat-loading">Loading...</div>
      ) : !anyConfigured ? (
        <div className="chat-welcome">
          <div className="chat-welcome-icon">
            <i className="codicon codicon-key" style={{ fontSize: 32 }}></i>
          </div>
          <div className="chat-welcome-text">
            Set up an API key to start chatting with AI assistants like OpenAI, Anthropic, Grok or Gemini.
          </div>
          <div className="chat-welcome-setup">
            <button className="chat-setup-btn" onClick={() => onNavigateToSettings?.()}>
              <i className="codicon codicon-settings-gear" style={{ fontSize: 13 }}></i>
              Open Settings → API Keys
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-model-bar">
            <select
              className="chat-model-select"
              value={selectedProvider}
              onChange={e => handleProviderChange(e.target.value)}
              title="Provider"
            >
              {configured.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="chat-model-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              title="Model"
            >
              {(models.length > 0 ? [...models].sort((a, b) => a.localeCompare(b)) : [selectedModel]).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="chat-messages">
            {messages.length > 0 && (
              <div className="chat-messages-toolbar">
                <button className="chat-clear-btn" onClick={clearThread} disabled={streaming}>
                  <i className="codicon codicon-clear-all" style={{ fontSize: 12 }}></i>
                  Clear
                </button>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <div className="chat-welcome-icon">
                  <i className="codicon codicon-comment-discussion" style={{ fontSize: 32 }}></i>
                </div>
                <div className="chat-welcome-text">
                  Ask me anything about your workspace, agents, or code.
                </div>
              </div>
            ) : (
              messages.map(renderMessage)
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder={`Message ${selectedProvider}...`}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={handleKeyDown}
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
                title="Send"
              >
                <i className="codicon codicon-send" style={{ fontSize: 13 }}></i>
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
