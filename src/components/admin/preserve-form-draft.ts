// React resets form actions even when they return validation errors. Its
// synthetic events are disabled during that reset, so use a native listener.
// Successful admin saves already redirect away; keep the draft until then.
export function preserveFormDraft(form: HTMLFormElement | null) {
  if (!form) return;
  const preventReset = (event: Event) => event.preventDefault();
  form.addEventListener("reset", preventReset);
  return () => form.removeEventListener("reset", preventReset);
}
