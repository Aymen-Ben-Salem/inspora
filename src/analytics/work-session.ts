let key: string | undefined,
  lastActive = 0;
export function getWorkSessionKey(now = Date.now()) {
  if (!key || now - lastActive >= 30 * 60000 || now < lastActive)
    key = crypto.randomUUID();
  lastActive = now;
  return key;
}
