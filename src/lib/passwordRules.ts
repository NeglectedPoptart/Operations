// The rules for a NEW password: at least 10 characters (no maximum), with one
// uppercase letter, one lowercase letter, one number and one symbol. Shared by
// the Change Password form (shows each rule ticking off) and the server
// actions (which enforce it - the form alone is never trusted).

export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordRule {
  key: string;
  label: string;
  ok: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { key: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { key: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { key: "lower", label: "One lowercase letter", ok: /[a-z]/.test(password) },
    { key: "number", label: "One number", ok: /[0-9]/.test(password) },
    { key: "symbol", label: "One symbol (like ! @ # $ %)", ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function passwordProblem(password: string): string | null {
  const missing = passwordRules(password).filter((r) => !r.ok);
  return missing.length === 0 ? null : `Password needs: ${missing.map((r) => r.label.toLowerCase()).join(", ")}.`;
}

// A random password that meets every rule (14 characters, no look-alike
// characters such as l/1/O/0 so it's easy to read out or type from a message).
export function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));
  // Fisher-Yates so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  // Reject the biased tail so every index is equally likely.
  const limit = Math.floor(0x100000000 / max) * max;
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}
