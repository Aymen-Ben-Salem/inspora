let current: { path: string; pageId: string } | undefined;
export function createPageViewContext(path: string) {
  if (current?.path !== path) current = { path, pageId: crypto.randomUUID() };
  return current!;
}
