'use client';

import React from 'react';
import type { ChatMessage as ChatMessageType } from '@/stores/chat-store';
import ThesisBlock from './ThesisBlock';
import TradeCardList from '@/components/trade/TradeCardList';

interface ChatMessageProps {
  message: ChatMessageType;
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n{2,}/);

  return paragraphs.map((para, pIdx) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    // Check for bullet list (lines starting with - or *)
    const bulletLines = trimmed.split('\n').filter((l) => /^\s*[-*]\s+/.test(l));
    if (bulletLines.length > 0 && bulletLines.length === trimmed.split('\n').length) {
      return (
        <ul key={pIdx} className="list-disc pl-5 my-2 space-y-1">
          {bulletLines.map((line, i) => (
            <li key={i} style={{ color: '#1a1a1a' }}>
              {renderInline(line.replace(/^\s*[-*]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    // Check for numbered list (lines starting with 1. 2. etc)
    const numLines = trimmed.split('\n').filter((l) => /^\s*\d+\.\s+/.test(l));
    if (numLines.length > 0 && numLines.length === trimmed.split('\n').length) {
      return (
        <ol key={pIdx} className="list-decimal pl-5 my-2 space-y-1">
          {numLines.map((line, i) => (
            <li key={i} style={{ color: '#1a1a1a' }}>
              {renderInline(line.replace(/^\s*\d+\.\s+/, ''))}
            </li>
          ))}
        </ol>
      );
    }

    // Regular paragraph
    return (
      <p key={pIdx} className="my-1.5">
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold** and *italic*
  const parts: React.ReactNode[] = [];
  // Regex to match **bold** or *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div
          className="max-w-[75%] rounded-2xl"
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(107, 92, 231, 0.08)',
            borderRadius: '18px 18px 4px 18px',
          }}
        >
          <p
            className="leading-relaxed"
            style={{ fontSize: '15px', color: '#1a1a1a', lineHeight: 1.7 }}
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
      {/* Brand icon */}
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-1"
        style={{ backgroundColor: '#6B5CE7' }}
      >
        <span
          className="font-bold"
          style={{ color: '#FFFFFF', fontSize: '11px', lineHeight: 1 }}
        >
          T
        </span>
      </div>

      <div className="max-w-[75%] min-w-0">
        {/* Text content */}
        <div
          className="rounded-2xl"
          style={{
            padding: '12px 16px',
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            borderRadius: '18px 18px 18px 4px',
          }}
        >
          <div
            style={{ fontSize: '15px', color: '#1a1a1a', lineHeight: 1.7 }}
          >
            {renderMarkdown(message.content)}
          </div>
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
