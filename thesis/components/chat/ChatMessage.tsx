import React from 'react';
import type { ChatMessage as ChatMessageType } from '@/stores/chat-store';
import ThesisBlock from './ThesisBlock';
import TradeCardList from '@/components/trade/TradeCardList';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div
          className="max-w-[85%] rounded-2xl"
          style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(147,130,255,0.12), rgba(147,130,255,0.06))',
            border: '1px solid rgba(147, 130, 255, 0.20)',
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
          >
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      {/* Branded icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1"
        style={{
          background: 'linear-gradient(135deg, #14141f, #1a1a2e)',
          border: '1px solid rgba(147, 130, 255, 0.15)',
        }}
      >
        <span style={{ color: 'var(--accent-purple, #9382ff)', fontSize: '14px' }}>
          &#9670;
        </span>
      </div>

      <div className="max-w-[85%] min-w-0">
        {/* Text content */}
        <div
          className="rounded-2xl"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-surface, rgba(255,255,255,0.02))',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
          }}
        >
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--text-primary, rgba(255,255,255,0.92))' }}
          >
            {message.content}
          </p>
        </div>

        {/* Thesis block */}
        {message.thesis && (
          <ThesisBlock
            thesisSummary={message.thesis.thesis_summary}
            causalChain={message.thesis.causal_chain}
          />
        )}

        {/* Trade recommendations */}
        {message.enrichedRecommendations &&
          message.enrichedRecommendations.length > 0 && (
            <div className="mt-3">
              <TradeCardList
                recommendations={message.enrichedRecommendations}
              />
            </div>
          )}
      </div>
    </div>
  );
}
