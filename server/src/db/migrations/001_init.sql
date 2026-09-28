CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  unit_label   TEXT NOT NULL,
  category     TEXT NOT NULL,
  price_paise  INTEGER NOT NULL CHECK (price_paise > 0)
);

CREATE TABLE cart_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token            TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','checked_out','settled','expired')),
  host_member_id   UUID,
  payer_member_id  UUID,
  revision         BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  checked_out_at   TIMESTAMPTZ
);

CREATE TABLE cart_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
  display_name       VARCHAR(30) NOT NULL,
  member_token_hash  TEXT NOT NULL UNIQUE,
  join_order         INTEGER NOT NULL,
  has_paid           BOOLEAN NOT NULL DEFAULT false,
  paid_at            TIMESTAMPTZ,
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, join_order)
);

ALTER TABLE cart_sessions
  ADD CONSTRAINT fk_host  FOREIGN KEY (host_member_id)  REFERENCES cart_members(id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_payer FOREIGN KEY (payer_member_id) REFERENCES cart_members(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE cart_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
  added_by          UUID NOT NULL REFERENCES cart_members(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  name              TEXT NOT NULL,
  unit_price_paise  INTEGER NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  type              TEXT NOT NULL CHECK (type IN ('personal','shared')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged','removed')),
  merged_into       UUID REFERENCES cart_items(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_session_active ON cart_items (session_id) WHERE status = 'active';
CREATE INDEX idx_items_dup_lookup    ON cart_items (session_id, product_id, type, status);

-- who pays for how many units of each line (BR-10, BR-16)
CREATE TABLE cart_item_contributions (
  item_id        UUID NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  member_id      UUID NOT NULL REFERENCES cart_members(id) ON DELETE CASCADE,
  quantity       INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  first_added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, member_id)
);
CREATE INDEX idx_contrib_member ON cart_item_contributions (member_id);

CREATE TABLE duplicate_groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  status            TEXT NOT NULL CHECK (status IN ('flagged','kept','merged','removed','dissolved')),
  kept_member_ids   UUID[] NOT NULL DEFAULT '{}',
  resolved_by       UUID REFERENCES cart_members(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- at most one live (flagged or kept) group per product per session
CREATE UNIQUE INDEX uq_live_dup_group ON duplicate_groups (session_id, product_id)
  WHERE status IN ('flagged','kept');
