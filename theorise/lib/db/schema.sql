-- ---------------------------------------------------------------------------
-- Thesis – Full Database Schema
-- ---------------------------------------------------------------------------

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users (wallet-based authentication)
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_wallet ON users (wallet_address);

-- ---------------------------------------------------------------------------
-- Theses
-- ---------------------------------------------------------------------------

CREATE TABLE theses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_text      TEXT NOT NULL,
  thesis_summary  TEXT NOT NULL,
  causal_chain    JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_theses_user ON theses (user_id);

-- ---------------------------------------------------------------------------
-- Recommendations
-- ---------------------------------------------------------------------------

CREATE TABLE recommendations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id             UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  venue                 TEXT NOT NULL CHECK (venue IN ('hyperliquid', 'polymarket')),
  instrument_type       TEXT NOT NULL CHECK (instrument_type IN ('perp', 'prediction')),
  symbol                TEXT NOT NULL,
  name                  TEXT NOT NULL,
  direction             TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'BUY_YES', 'BUY_NO')),
  conviction            NUMERIC(4,3) NOT NULL CHECK (conviction >= 0 AND conviction <= 1),
  rationale             TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN ('commodity', 'crypto', 'equity_index', 'prediction')),
  correlation_to_thesis TEXT NOT NULL CHECK (correlation_to_thesis IN ('direct', 'second_order', 'hedge')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommendations_thesis ON recommendations (thesis_id);

-- ---------------------------------------------------------------------------
-- Trades
-- ---------------------------------------------------------------------------

CREATE TABLE trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE SET NULL,
  venue           TEXT NOT NULL CHECK (venue IN ('hyperliquid', 'polymarket')),
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'BUY_YES', 'BUY_NO')),
  size_usdc       NUMERIC(18,6) NOT NULL,
  leverage        NUMERIC(6,2) NOT NULL DEFAULT 1,
  order_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'failed')),
  fill_price      NUMERIC(18,6),
  tx_hash         TEXT,
  filled_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_user ON trades (user_id);
CREATE INDEX idx_trades_status ON trades (status);

-- ---------------------------------------------------------------------------
-- Strategies (shareable thesis + recommendations bundles)
-- ---------------------------------------------------------------------------

CREATE TABLE strategies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thesis_id       UUID NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT false,
  copied_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategies_user ON strategies (user_id);
CREATE INDEX idx_strategies_public ON strategies (is_public) WHERE is_public = true;

-- ---------------------------------------------------------------------------
-- Vault Waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE vault_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_waitlist_email ON vault_waitlist (email);
