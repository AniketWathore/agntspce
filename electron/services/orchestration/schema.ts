import type Database from 'better-sqlite3'

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      capabilities TEXT NOT NULL DEFAULT '[]',
      registered_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      session_summary TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      declared_files TEXT NOT NULL DEFAULT '[]',
      actual_files TEXT,
      branch_name TEXT,
      worktree_path TEXT,
      agent_id TEXT REFERENCES agents(id),
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      branch_point TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      session_type TEXT NOT NULL,
      agent_id TEXT REFERENCES agents(id),
      task_id TEXT REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'idle',
      branch TEXT,
      worktree_id TEXT,
      created_at INTEGER NOT NULL,
      last_activity INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);

    CREATE TABLE IF NOT EXISTS worktrees (
      id TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      branch_name TEXT,
      worktree_path TEXT,
      source_ref TEXT,
      task_id TEXT REFERENCES tasks(id),
      session_id TEXT,
      created_at INTEGER NOT NULL,
      removed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_worktrees_task ON worktrees(task_id);
    CREATE INDEX IF NOT EXISTS idx_worktrees_branch ON worktrees(branch_name);

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      file_path TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      released_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_claims_task ON claims(task_id);
    CREATE INDEX IF NOT EXISTS idx_claims_agent ON claims(agent_id);
    CREATE INDEX IF NOT EXISTS idx_claims_file ON claims(file_path);

    CREATE TABLE IF NOT EXISTS agent_contexts (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id),
      context_md TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_contexts_updated ON agent_contexts(updated_at);

    CREATE TABLE IF NOT EXISTS gates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'blocked',
      reason TEXT NOT NULL,
      decision TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_gates_task ON gates(task_id);
    CREATE INDEX IF NOT EXISTS idx_gates_status ON gates(status);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_agent_id TEXT NOT NULL REFERENCES agents(id),
      to_agent_id TEXT REFERENCES agents(id),
      broadcast INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_by TEXT NOT NULL DEFAULT '[]',
      deliver_only_when_idle INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS escalations (
      id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      involved_agent_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'open',
      decision TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS status_updates (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id);
    CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
    CREATE INDEX IF NOT EXISTS idx_status_updates_task ON status_updates(task_id);

    CREATE TABLE IF NOT EXISTS workspace_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO workspace_config (key, value) VALUES ('integration_branch', 'agntspce-integration');
    INSERT OR IGNORE INTO workspace_config (key, value) VALUES ('source_branch', '');

    CREATE TABLE IF NOT EXISTS task_summaries (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id),
      summary TEXT NOT NULL,
      key_files TEXT NOT NULL DEFAULT '[]',
      status_line TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `)
}

// Migrations for databases created by an earlier schema version. Safe to run
// after createSchema on every boot — each migration checks before altering.
export function migrateSchema(db: Database.Database): void {
  const taskColumns = db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]
  if (!taskColumns.some(c => c.name === 'failure_count')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0`)
  }

  const msgColumns = db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[]
  if (!msgColumns.some(c => c.name === 'deliver_only_when_idle')) {
    db.exec(`ALTER TABLE messages ADD COLUMN deliver_only_when_idle INTEGER NOT NULL DEFAULT 0`)
  }
}
