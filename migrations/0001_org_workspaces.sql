-- AI Control Center / Organization Workspaces V1.
-- Run once on the Cloudflare D1 database bound as ORG_DB.
-- Each CEO mission gets a separate room_id. GitHub Issues are not used for messages.
CREATE TABLE IF NOT EXISTS org_rooms (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  mission TEXT NOT NULL CHECK (length(mission) BETWEEN 1 AND 4000),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_org_rooms_repo ON org_rooms(repo,created_at DESC);

CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES org_rooms(id),
  slot TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CEO','DIR','TL','ENGINEER','QA-REVIEWER','PROJECT-LEAD')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(room_id,slot)
);
CREATE INDEX IF NOT EXISTS idx_org_members_room ON org_members(room_id);

CREATE TABLE IF NOT EXISTS org_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES org_rooms(id),
  seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 99999),
  sender_slot TEXT NOT NULL,
  recipient_slot TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(room_id,seq)
);
CREATE INDEX IF NOT EXISTS idx_org_messages_room_seq ON org_messages(room_id,seq);

CREATE TABLE IF NOT EXISTS org_tasks (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES org_rooms(id),
  seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 99999),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 200),
  description TEXT NOT NULL DEFAULT '',
  assignee_slot TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','IN_PROGRESS','WAITING_QA','QA_HOLD','DONE','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(room_id,seq)
);
CREATE INDEX IF NOT EXISTS idx_org_tasks_room_seq ON org_tasks(room_id,seq);

-- Initial CEO bootstrap: OWNER creates an expiring one-time link; the CEO receives
-- a browser cookie after redemption, and can create a room without GitHub login.
CREATE TABLE IF NOT EXISTS org_ceo_tickets (
  token_hash TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS org_creator_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  repo TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
