const DB_NAME = "viewpull-db";
const DB_VERSION = 1;

const STORES = {
  kv: "kv",
  tasks: "tasks",
  files: "files",
  memory: "memory"
};

let dbPromise = null;
let fallbackReason = "";

export const contentDatabase = {
  async ready() {
    return getDatabase();
  },

  async getKey(key, fallback = null) {
    const db = await getDatabase();
    if (!db) return readLocal(`viewpull-db:${key}`, fallback);
    const value = await requestToPromise(transactionStore(db, STORES.kv, "readonly").get(key));
    return value?.value ?? fallback;
  },

  async setKey(key, value) {
    const db = await getDatabase();
    if (!db) {
      writeLocal(`viewpull-db:${key}`, value);
      return value;
    }
    await requestToPromise(transactionStore(db, STORES.kv, "readwrite").put({ key, value, updatedAt: now() }));
    return value;
  },

  async listTasks() {
    const db = await getDatabase();
    if (!db) return readLocal("viewpull-tasks", []);
    const tasks = await requestToPromise(transactionStore(db, STORES.tasks, "readonly").getAll());
    return tasks.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  },

  async putTask(task) {
    const db = await getDatabase();
    const nextTask = {
      ...task,
      updatedAt: now(),
      createdAt: task.createdAt || now()
    };

    if (!db) {
      const tasks = readLocal("viewpull-tasks", []);
      const index = tasks.findIndex((item) => item.taskId === task.taskId);
      if (index >= 0) tasks[index] = nextTask;
      else tasks.unshift(nextTask);
      writeLocal("viewpull-tasks", tasks.slice(0, 80));
      return nextTask;
    }

    await requestToPromise(transactionStore(db, STORES.tasks, "readwrite").put(nextTask));
    return nextTask;
  },

  async listFiles(taskId) {
    const db = await getDatabase();
    if (!db) {
      return readLocal("viewpull-files", []).filter((file) => file.taskId === taskId);
    }
    const index = transactionStore(db, STORES.files, "readonly").index("taskId");
    return requestToPromise(index.getAll(taskId));
  },

  async putFile(file) {
    const db = await getDatabase();
    if (!db) {
      const files = readLocal("viewpull-files", []);
      const index = files.findIndex((item) => item.id === file.id);
      if (index >= 0) files[index] = file;
      else files.unshift(file);
      writeLocal("viewpull-files", files.slice(0, 200));
      return file;
    }
    await requestToPromise(transactionStore(db, STORES.files, "readwrite").put(file));
    return file;
  },

  async getMemory(namespace, fallback) {
    const db = await getDatabase();
    if (!db) return readLocal(namespace, fallback);
    const value = await requestToPromise(transactionStore(db, STORES.memory, "readonly").get(namespace));
    return value?.value ?? fallback;
  },

  async setMemory(namespace, value) {
    const db = await getDatabase();
    if (!db) {
      writeLocal(namespace, value);
      return value;
    }
    await requestToPromise(transactionStore(db, STORES.memory, "readwrite").put({ namespace, value, updatedAt: now() }));
    return value;
  },

  mode() {
    return fallbackReason ? "localStorage" : "indexedDB";
  },

  fallbackReason() {
    return fallbackReason;
  }
};

export async function migrateLegacyLocalStorage() {
  const db = await getDatabase();
  if (!db) return;

  const legacyTasks = readLocal("viewpull-tasks", []);
  for (const task of legacyTasks) {
    if (task?.taskId) await contentDatabase.putTask(task);
  }

  const legacyFiles = readLocal("viewpull-files", []);
  for (const file of legacyFiles) {
    if (file?.taskId && file?.path) {
      await contentDatabase.putFile({
        ...file,
        id: file.id || `${file.taskId}:${file.path}`
      });
    }
  }

  const legacyMemory = readLocal("viewpull-memory", null);
  if (legacyMemory) await contentDatabase.setMemory("viewpull-memory", legacyMemory);
}

async function getDatabase() {
  if (!("indexedDB" in window)) {
    fallbackReason = "IndexedDB is not available.";
    return null;
  }

  dbPromise ||= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORES.memory)) db.createObjectStore(STORES.memory, { keyPath: "namespace" });
      if (!db.objectStoreNames.contains(STORES.tasks)) db.createObjectStore(STORES.tasks, { keyPath: "taskId" });
      if (!db.objectStoreNames.contains(STORES.files)) {
        const files = db.createObjectStore(STORES.files, { keyPath: "id" });
        files.createIndex("taskId", "taskId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      fallbackReason = request.error?.message || "IndexedDB open failed.";
      resolve(null);
    };
    request.onblocked = () => {
      fallbackReason = "IndexedDB migration is blocked by another tab.";
      resolve(null);
    };
  });

  return dbPromise;
}

function transactionStore(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}
