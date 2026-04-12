/* ============================================================
   faero OS — STORAGE (localStorage + IndexedDB)
   ============================================================ */

const Storage = (() => {

  /* ── localStorage helpers ─────────────────────────────── */
  const get = (key, fallback = null) => {
    try {
      const v = localStorage.getItem('faero_' + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  };

  const set = (key, value) => {
    try { localStorage.setItem('faero_' + key, JSON.stringify(value)); }
    catch (e) { console.warn('Storage.set failed', e); }
  };

  const del = (key) => localStorage.removeItem('faero_' + key);

  /* ── IndexedDB for large files ────────────────────────── */
  let _db = null;
  const DB_NAME = 'faeroDB';
  const DB_VER = 1;
  const STORES = ['files', 'posts', 'profile'];

  const openDB = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach(s => {
        if (!db.objectStoreNames.contains(s)) {
          const store = db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
          if (s === 'files') {
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('name', 'name', { unique: false });
          }
          if (s === 'posts') {
            store.createIndex('ts', 'ts', { unique: false });
          }
        }
      });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e);
  });

  const dbPut = async (storeName, record) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  };

  const dbGetAll = async (storeName, indexName, query) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = indexName ? store.index(indexName).getAll(query) : store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  };

  const dbDelete = async (storeName, id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = resolve;
      req.onerror = reject;
    });
  };

  /* ── File helpers ─────────────────────────────────────── */
  const saveFile = async (name, type, dataURL, extra = {}) => {
    const id = await dbPut('files', { name, type, dataURL, ts: Date.now(), ...extra });
    return id;
  };

  const getFiles = async (type = null) => {
    if (type) return dbGetAll('files', 'type', type);
    return dbGetAll('files');
  };

  const deleteFile = (id) => dbDelete('files', id);

  /* ── Post helpers ─────────────────────────────────────── */
  const savePost = async (post) => {
    const id = await dbPut('posts', { ...post, ts: post.ts || Date.now() });
    return id;
  };

  const getPosts = () => dbGetAll('posts');
  const deletePost = (id) => dbDelete('posts', id);

  /* ── Profile ──────────────────────────────────────────── */
  const getProfile = () => get('profile', {
    username: 'faerouser',
    displayName: 'faero User',
    handle: '@faerouser',
    bio: 'living in glass and gradients...',
    avatar: null,
    avatarLetter: 'f',
    avatarGrad: 'linear-gradient(135deg, #80d4ff, #1a88d4)',
    bgColor: null,
    bgImage: null,
    mood: 'somewhere between 2004 and forever',
    friends: 42,
    posts: 0,
    views: '1.2k',
    layoutFont: 'Nunito',
    profileTheme: 'frutiger-aero'
  });

  const setProfile = (data) => set('profile', { ...getProfile(), ...data });

  return { get, set, del, saveFile, getFiles, deleteFile, savePost, getPosts, deletePost, getProfile, setProfile, openDB };

})();

window.faeroStorage = Storage;
window.AeroStorage = Storage; // Alias for old code
