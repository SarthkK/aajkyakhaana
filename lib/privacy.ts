/**
 * Keeping the flat's identities out of model providers.
 *
 * Free-tier endpoints are allowed to train on what they receive — that is the price of
 * the tier, and it is stated plainly in the README. So the people are pseudonymised
 * before anything leaves the server and put back afterwards.
 *
 * Aliases rather than "Flatmate 1" because the assistant writes replies people read:
 * "Person B is vegetarian, so…" restores cleanly to "Khushi is vegetarian, so…",
 * where a numbered label reads like a database row.
 *
 * What is never sent at all, in any prompt: real names, email addresses, ages,
 * heights, weights. Diets, goals, allergies and dislikes are sent, because a plan that
 * ignores an allergy is worse than useless — and on their own they identify nobody.
 */

const ALIASES = ["Person A", "Person B", "Person C", "Person D", "Person E", "Person F"];

export type Pseudonymised<T> = {
  members: T[];
  /** alias → the real name, for putting back. */
  restore: Map<string, string>;
};

/** Replaces each person's name with a stable alias for this one request. */
export function pseudonymise<T extends { name: string }>(members: T[]): Pseudonymised<T> {
  const restore = new Map<string, string>();

  const aliased = members.map((member, i) => {
    const alias = ALIASES[i] ?? `Person ${i + 1}`;
    restore.set(alias, member.name);
    return { ...member, name: alias };
  });

  return { members: aliased, restore };
}

/**
 * Puts the real names back into whatever the model wrote.
 *
 * Best-effort by design: if the model ignored the aliases the text is simply left
 * alone, which reads slightly oddly but never exposes anyone. Longest alias first so
 * "Person A" inside "Person AB" cannot be half-replaced.
 */
export function restoreNames(text: string, restore: Map<string, string>): string {
  let out = text;
  for (const [alias, real] of [...restore].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replaceAll(alias, real);
  }
  return out;
}
