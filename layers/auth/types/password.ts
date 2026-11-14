export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';

export interface PasswordStrengthChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

export interface PasswordStrength {
  score: number;
  level: PasswordStrengthLevel;
  feedback: string;
  checks: PasswordStrengthChecks;
  color: string;
}
