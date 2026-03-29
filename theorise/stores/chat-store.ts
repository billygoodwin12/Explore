// ---------------------------------------------------------------------------
// Chat store (Zustand)
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { ThesisAnalysis, EnrichedRecommendation } from '../lib/venues/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Raw JSON string from AI — used when sending history back to Claude */
  rawJson?: string;
  thesis?: ThesisAnalysis;
  enrichedRecommendations?: EnrichedRecommendation[];
  timestamp: Date;
}

export interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (
    msg: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string; timestamp?: Date },
  ) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let messageCounter = 0;

function generateId(): string {
  messageCounter += 1;
  return `msg_${Date.now()}_${messageCounter}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: msg.id ?? generateId(),
          role: msg.role,
          content: msg.content,
          rawJson: msg.rawJson,
          thesis: msg.thesis,
          enrichedRecommendations: msg.enrichedRecommendations,
          timestamp: msg.timestamp ?? new Date(),
        },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [] }),
}));
