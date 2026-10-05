// Almacenamiento local en el dispositivo (IndexedDB), con respaldo en memoria
// si el navegador no lo permite (por ejemplo, en una ventana privada).

const DB_NAME = "agenda-jhullians";
const STORE = "kv";

let dbPromise = null;
const memory = new Map();

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          const r = fn(null);
          return resolve(r && "result" in r ? r.result : undefined);
        }
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export async function get(key, fallback = null) {
  const value = await run("readonly", (s) => (s ? s.get(key) : { result: memory.get(key) }));
  return value === undefined ? fallback : value;
}

export async function set(key, value) {
  await run("readwrite", (s) => {
    if (s) return s.put(value, key);
    memory.set(key, value);
    return null;
  });
}

export async function del(key) {
  await run("readwrite", (s) => {
    if (s) return s.delete(key);
    memory.delete(key);
    return null;
  });
}

// Pide al navegador que no borre estos datos cuando le falte espacio.
export function persist() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* sin soporte */
  }
}
