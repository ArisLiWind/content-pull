import { contentDatabase } from "./database.js";

export class AgentMemory {
  constructor(namespace = "viewpull-memory") {
    this.namespace = namespace;
  }

  recall() {
    return readJson(this.namespace, {
      working: {},
      episodic: [],
      approvals: []
    });
  }

  rememberTask(task, event) {
    const memory = this.recall();
    memory.working[task.taskId] = {
      topic: task.topic.normalized,
      status: task.status,
      currentNode: task.currentNode,
      updatedAt: new Date().toISOString()
    };
    memory.episodic = [
      {
        taskId: task.taskId,
        event,
        status: task.status,
        at: new Date().toISOString()
      },
      ...memory.episodic
    ].slice(0, 80);
    writeJson(this.namespace, memory);
    return memory;
  }

  recordApproval(task, approval) {
    const memory = this.recall();
    memory.approvals = [
      {
        taskId: task.taskId,
        approval,
        at: new Date().toISOString()
      },
      ...memory.approvals
    ].slice(0, 40);
    writeJson(this.namespace, memory);
    return memory;
  }
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  contentDatabase.setMemory(key, value);
}
