/**
 * A static check for regular expressions that can take exponential time
 * (ReDoS): a repeated group that itself contains repetition, such as
 * `(a+)+` or `(\w*\s?)*`, and backreferences. Patterns in `pattern`
 * validators come from survey authors and run on the server, so these
 * shapes are refused. It errs on the side of refusing.
 */

/** Why the pattern is risky, or null when it is fine. */
export function regexRisk(pattern: string): string | null {
  if (/\\[1-9]|\\k</.test(pattern)) return "Backreferences are not allowed in patterns";
  // For each open group: whether it contains a repeating quantifier.
  const stack: boolean[] = [];
  let lastGroupRepeats = false;
  let lastWasGroup = false;
  /**
   * The quantifier at i: its length (0 for none), whether it repeats more than once (`*`, `+`, `{2}`, `{1,5}`…),
   * and whether the count varies (`*`, `+`, `{1,5}`, `{2,}`). A fixed count like `{2}` inside a group can't
   * backtrack; any repetition of a group that contains a varying one can.
   */
  const quantifierAt = (i: number): { length: number; repeats: boolean; varies: boolean } => {
    const c = pattern[i];
    if (c === "*" || c === "+") return { length: 1, repeats: true, varies: true };
    if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (!m) return { length: 0, repeats: false, varies: false };
      const min = Number(m[1]);
      const max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
      return { length: m[0].length, repeats: max > 1, varies: max > min };
    }
    return { length: 0, repeats: false, varies: false };
  };
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\") {
      i++;
      lastWasGroup = false;
      continue;
    }
    if (c === "[") {
      // Skip the character class.
      i++;
      if (pattern[i] === "^") i++;
      if (pattern[i] === "]") i++;
      while (i < pattern.length && pattern[i] !== "]") i += pattern[i] === "\\" ? 2 : 1;
      lastWasGroup = false;
      continue;
    }
    if (c === "(") {
      stack.push(false);
      lastWasGroup = false;
      continue;
    }
    if (c === ")") {
      lastGroupRepeats = stack.pop() ?? false;
      // A group that contains repetition makes the group around it contain repetition too.
      if (lastGroupRepeats && stack.length) stack[stack.length - 1] = true;
      lastWasGroup = true;
      continue;
    }
    const q = quantifierAt(i);
    if (q.length) {
      if (q.repeats && lastWasGroup && lastGroupRepeats) return "Repetition inside repetition (like (a+)+) can make matching take forever";
      if (q.varies && stack.length) stack[stack.length - 1] = true;
      i += q.length - 1;
      lastWasGroup = false;
      continue;
    }
    lastWasGroup = false;
  }
  return null;
}
