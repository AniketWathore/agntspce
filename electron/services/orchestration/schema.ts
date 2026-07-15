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
      branch_point TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_agent_id TEXT NOT NULL REFERENCES agents(id),
      to_agent_id TEXT REFERENCES agents(id),
      broadcast INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_by TEXT NOT NULL DEFAULT '[]'
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
