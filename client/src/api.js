import { useCallback, useEffect, useState } from 'react';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : method === 'GET' ? undefined : '{}',
  });
  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) data = await res.json();
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p, body) => api(p, { method: 'DELETE', body });

/** Charge une ressource ; `reload()` pour rafraîchir. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    setState((s) => ({ ...s, loading: true }));
    return get(path)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// ───── Notifications éphémères ─────
const listeners = new Set();
export function toast(message, type = 'ok') {
  const t = { id: Math.random(), message, type };
  listeners.forEach((l) => l(t));
}
export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const l = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3500);
    };
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return items;
}

/** Exécute une action asynchrone avec notification d'erreur. */
export async function action(fn, succes) {
  try {
    const r = await fn();
    if (succes) toast(succes);
    return r;
  } catch (e) {
    toast(e.message, 'erreur');
    throw e;
  }
}
