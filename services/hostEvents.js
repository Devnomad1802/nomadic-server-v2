// ─────────────────────────────────────────────────────────────
// Lightweight per-host Server-Sent Events hub (realtime chat).
// In-memory registry: hostId -> Set<res>. Single-process (pm2 fork);
// if the API is ever scaled horizontally this must move to Redis pub/sub.
// Events carry NO message body or PII — only { type, enquiryId, hostUnread }.
// The client fetches the sanitized conversation over the normal API.
// ─────────────────────────────────────────────────────────────

const clients = new Map(); // hostId -> Set<res>

export const addClient = (hostId, res) => {
  const key = String(hostId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
};

export const removeClient = (hostId, res) => {
  const key = String(hostId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
};

// Push a small JSON event to every live connection for this host.
export const emitToHost = (hostId, event) => {
  const set = clients.get(String(hostId));
  if (!set || set.size === 0) return;
  const payload = `event: ${event.type || "message"}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* dropped on next heartbeat */ }
  }
};

export const hostClientCount = (hostId) => clients.get(String(hostId))?.size || 0;
