import mysql from "mysql2/promise";
import { config } from "./config.mjs";

let pool;

export function getPool() {
  pool ||= mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: config.mysql.connectionLimit,
    namedPlaceholders: true
  });
  return pool;
}

export async function createTask({ id, input, conversation, draft }) {
  await getPool().execute(
    `INSERT INTO tasks (id, input, conversation, draft, updated_draft)
     VALUES (:id, :input, CAST(:conversation AS JSON), :draft, :updatedDraft)`,
    {
      id,
      input,
      conversation: JSON.stringify(conversation),
      draft,
      updatedDraft: draft
    }
  );
  return getTask(id);
}

export async function getTask(id) {
  const [rows] = await getPool().execute(
    `SELECT id, input, conversation, draft, updated_draft AS updatedDraft, created_at AS createdAt, updated_at AS updatedAt
     FROM tasks
     WHERE id = :id
     LIMIT 1`,
    { id }
  );

  const task = rows[0] || null;
  if (!task) return null;

  return {
    ...task,
    conversation: parseConversation(task.conversation)
  };
}

export async function updateTaskDraft({ id, conversation, draft }) {
  await getPool().execute(
    `UPDATE tasks
     SET conversation = CAST(:conversation AS JSON),
         draft = :draft,
         updated_draft = :updatedDraft
     WHERE id = :id`,
    {
      id,
      conversation: JSON.stringify(conversation),
      draft,
      updatedDraft: draft
    }
  );
  return getTask(id);
}

function parseConversation(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

