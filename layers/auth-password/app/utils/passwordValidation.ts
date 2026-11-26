import { passwordComplexitySchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import type { PasswordStrength } from '#layers/auth-password/types/password';

/**
 * Calculate password strength based on various criteria
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      level: 'weak',
      checks: {
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
      },
      color: 'var(--destructive)',
    };
  }

  // Validate password against schema
  const result = passwordComplexitySchema.safeParse(password);

  let checks: PasswordStrength['checks'];

  if (result.success) {
    // All checks passed
    checks = {
      length: true,
      uppercase: true,
      lowercase: true,
      number: true,
      special: true,
    };
  } else {
    // Parse validation errors to determine which checks failed
    const errorMessages = result.error.issues.map((issue) => issue.message);
    checks = {
      length: !errorMessages.includes('validation.password_min'),
      uppercase: !errorMessages.includes('validation.password_uppercase'),
      lowercase: !errorMessages.includes('validation.password_lowercase'),
      number: !errorMessages.includes('validation.password_number'),
      special: !errorMessages.includes('validation.password_special'),
    };
  }

  // Calculate score (20 points per check)
  let score = 0;
  if (checks.length) score += 20;
  if (checks.uppercase) score += 20;
  if (checks.lowercase) score += 20;
  if (checks.number) score += 20;
  if (checks.special) score += 20;

  // Bonus points for extra length
  if (password.length >= 12) score += 5;
  if (password.length >= 16) score += 5;

  // Cap at 100
  score = Math.min(score, 100);

  // Determine level and color
  let level: PasswordStrength['level'];
  let color: string;

  if (score < 40) {
    level = 'weak';
    color = 'var(--destructive)';
  } else if (score < 60) {
    level = 'fair';
    color = 'hsl(25, 95%, 53%)';
  } else if (score < 80) {
    level = 'good';
    color = 'hsl(45, 93%, 47%)';
  } else if (score < 100) {
    level = 'strong';
    color = 'hsl(142, 76%, 36%)';
  } else {
    level = 'very-strong';
    color = 'hsl(142, 76%, 36%)';
  }

  return {
    score,
    level,
    checks,
    color,
  };
}
