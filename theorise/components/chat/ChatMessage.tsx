'use client';

import React from 'react';
import type { ChatMessage as ChatMessageType } from '@/stores/chat-store';
import ThesisBlock from './ThesisBlock';
import TradeCardList from '@/components/trade/TradeCardList';

interface ChatMessageProps {
  message: ChatMessageType;
}

/* ------------------------------------------------------------------ */
/*  Lightweight markdown renderer                                     */
/* ------------------------------------------------------------------ */

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function renderMarkdown(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n{2,}/);

  return paragraphs.map((para, pIdx) => {
    const trimmed = para.trim();
    if (!trimmed) return null;

    const lines = trimmed.split('\n');

    // Bullet list
    const bulletLines = lines.filter((l) => /^\s*[-*]\s+/.test(l));
    if (bulletLines.length > 0 && bulletLines.length === lines.length) {
      return (
        <ul key={pIdx} style={{ margin: '6px 0', paddingLeft: 20 }}>
          {bulletLines.map((line, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {renderInline(line.replace(/^\s*[-*]\s+/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    // Numbered list
    const numLines = lines.filter((l) => /^\s*\d+\.\s+/.test(l));
    if (numLines.length > 0 && numLines.length === lines.length) {
      return (
        <ol key={pIdx} style={{ margin: '6px 0', paddingLeft: 20 }}>
          {numLines.map((line, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {renderInline(line.replace(/^\s*\d+\.\s+/, ''))}
            </li>
          ))}
        </ol>
      );
    }

    // Paragraph
    return (
      <p key={pIdx} style={{ margin: '6px 0' }}>
        {renderInline(trimmed)}
      </p>
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <div
          style={{
            maxWidth: '75%',
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomRightRadius: 4,
            background: '#f3f2ef',
            fontSize: 14,
            color: '#1a1917',
            lineHeight: 1.55,
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div style={{ maxWidth: '95%', marginBottom: 0 }}>
      {/* Text bubble row */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        {/* T icon */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#1a1917',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1,
            }}
          >
            T
          </span>
        </div>

        {/* Text bubble */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 16,
            borderBottomLeftRadius: 4,
            background: '#ffffff',
            border: '1px solid #eeedea',
            fontSize: 14,
            color: '#3d3b37',
            lineHeight: 1.6,
          }}
        >
          {renderMarkdown(message.content)}
        </div>
      </div>

      {/* Thesis block */}
      {message.thesis && (
        <div style={{ marginLeft: 38, marginBottom: 14 }}>
          <ThesisBlock
            thesisSummary={message.thesis.thesis_summary}
            causalChain={message.thesis.causal_chain}
          />
        </div>
      )}

      {/* Trade recommendations */}
      {message.enrichedRecommendations &&
        message.enrichedRecommendations.length > 0 && (
          <div style={{ marginLeft: 38 }}>
            <TradeCardList recommendations={message.enrichedRecommendations} />
          </div>
        )}
    </div>
  );
}
