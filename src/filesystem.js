import { contentDatabase } from "./database.js";

export class VirtualFilesystem {
  constructor(namespace = "viewpull-files") {
    this.namespace = namespace;
  }

  list(taskId) {
    return this.readStore().filter((file) => file.taskId === taskId);
  }

  write(taskId, path, content, metadata = {}) {
    const store = this.readStore();
    const now = new Date().toISOString();
    const index = store.findIndex((file) => file.taskId === taskId && file.path === path);
    const file = {
      taskId,
      path,
      content,
      metadata,
      updatedAt: now,
      createdAt: index >= 0 ? store[index].createdAt : now
    };

    if (index >= 0) {
      store[index] = file;
    } else {
      store.unshift(file);
    }

    this.writeStore(store.slice(0, 120));
    contentDatabase.putFile({
      ...file,
      id: `${taskId}:${path}`
    });
    return file;
  }

  read(taskId, path) {
    return this.readStore().find((file) => file.taskId === taskId && file.path === path) || null;
  }

  readStore() {
    try {
      return JSON.parse(localStorage.getItem(this.namespace) || "[]");
    } catch {
      return [];
    }
  }

  writeStore(files) {
    localStorage.setItem(this.namespace, JSON.stringify(files));
  }
}
