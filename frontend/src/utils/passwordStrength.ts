export type PasswordStrengthLabel = "Weak" | "Fair" | "Good" | "Strong";

export interface PasswordStrength {
  /** 0-4, for driving a segmented strength bar. */
  score: number;
  label: PasswordStrengthLabel;
}

const LABELS: PasswordStrengthLabel[] = ["Weak", "Weak", "Fair", "Good", "Strong"];

/** Simple, dependency-free heuristic: length + character-class variety. Not a security measure — the real policy is enforced server-side. */
export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const clamped = Math.min(score, 4);
  return { score: clamped, label: LABELS[clamped] ?? "Weak" };
}
