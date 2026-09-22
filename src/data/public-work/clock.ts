// Internal clock seam. Tests replace this module without changing the public API.
export function evaluationTime(): Date {
  return new Date();
}
