import { useState } from 'react'

interface Props {
  onClose: () => void
}

const SUGGESTIONS = [
  'How do I create a new workspace?',
  'Show me token reduction stats',
  'Help me debug an agent session',
]

const INITIAL_MESSAGES = [
  { role: 'assistant', text: 'Hi! I\'m your workspace assistant. I can help you manage agents, workspaces, and monitor token usage. What would you like to know?' },
]

export default function ChatSidebar({ onClose }: Props) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')

  function handleSend() {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', text: input.trim() }])
    setInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'I\'m still learning. For now, try the Dashboard to see token savings or check your agent terminals.',
      }])
    }, 600)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside className="chat-sidebar">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-icon">💬</span>
          <span className="chat-header-title">Assistant</span>
        </div>
        <button className="chat-close-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-msg-avatar">
              {msg.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="chat-msg-content">
              <div className="chat-msg-sender">
                {msg.role === 'assistant' ? 'Assistant' : 'You'}
              </div>
              <div className="chat-msg-text">{msg.text}</div>
            </div>
          </div>
        ))}
        {messages.length === 1 && (
          <div className="chat-suggestions">
            <div className="chat-suggestions-label">Try asking:</div>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                className="chat-suggestion-btn"
                onClick={() => {
                  setMessages(prev => [...prev, { role: 'user', text: s }])
                  setTimeout(() => {
                    setMessages(prev => [...prev, {
                      role: 'assistant',
                      text: 'I\'m still learning. For now, try the Dashboard to see token savings or check your agent terminals.',
                    }])
                  }, 600)
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <input
          className="chat-input"
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </aside>
  )
}
