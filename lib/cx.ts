/**
 * Joins class names, skipping anything falsy.
 *
 * Deliberately here rather than in components/ui.tsx: that module is "use client", so
 * anything importing from it becomes unusable on the server. The loading.tsx
 * boundaries are server components and render skeletons, which need this — importing
 * it from the client module made every one of them crash at runtime with
 * "Attempted to call cx() from the server", while still building cleanly.
 */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
