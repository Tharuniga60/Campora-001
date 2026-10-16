// Server-Sent Events: one stream set per user, used for live deal updates, chat and notifications.

export const streams = new Map();
 // userId -> Set<res>
export function push(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}
export const pushAll = (event, data) => { for (const id of streams.keys()) push(id, event, data); };
