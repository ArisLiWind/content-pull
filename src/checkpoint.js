export class MemoryCheckpointer {
  constructor({ namespace = "viewpull-memory" } = {}) {
    this.namespace = namespace;
    this.snapshots = new Map();
  }

  save(taskId, state, metadata = {}) {
    const checkpoint = {
      id: crypto.randomUUID(),
      taskId,
      namespace: this.namespace,
      metadata,
      state: structuredClone(state),
      createdAt: new Date().toISOString()
    };
    const history = this.snapshots.get(taskId) || [];
    this.snapshots.set(taskId, [...history, checkpoint].slice(-120));
    return checkpoint;
  }

  latest(taskId) {
    const history = this.snapshots.get(taskId) || [];
    return history[history.length - 1] || null;
  }

  list(taskId) {
    return [...(this.snapshots.get(taskId) || [])];
  }
}
