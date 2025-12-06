import { z } from 'zod'

export interface PasswordStrength {
  score: number // 0-100
  level: 'weak' | 'fair' | 'good' | 'strong' | 'very-strong'
  feedback: string
  checks: {
    length: boolean
    uppercase: boolean
    lowercase: boolean
    number: boolean
    special: boolean
  }
  color: string
}

// Custom Zod schema for password complexity
export const passwordComplexitySchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')

// Base schema for individual field validation
const baseRegistrationSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  email: z.string()
    .email('Please enter a valid email address'),
  password: passwordComplexitySchema,
  confirmPassword: z.string(),
})

// Registration form schema with password matching validation
export const registrationSchema = baseRegistrationSchema.refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type RegistrationFormData = z.infer<typeof registrationSchema>

export function usePasswordValidation() {
  /**
   * Calculate password strength based on various criteria
   */
  function calculatePasswordStrength(password: string): PasswordStrength {
    if (!password) {
      return {
        score: 0,
        level: 'weak',
        feedback: 'Enter a password',
        checks: {
          length: false,
          uppercase: false,
          lowercase: false,
          number: false,
          special: false,
        },
        color: 'hsl(var(--destructive))',
      }
    }

    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^a-zA-Z0-9]/.test(password),
    }

    // Calculate score (20 points per check)
    let score = 0
    if (checks.length) score += 20
    if (checks.uppercase) score += 20
    if (checks.lowercase) score += 20
    if (checks.number) score += 20
    if (checks.special) score += 20

    // Bonus points for extra length
    if (password.length >= 12) score += 5
    if (password.length >= 16) score += 5

    // Cap at 100
    score = Math.min(score, 100)

    // Determine level and feedback
    let level: PasswordStrength['level']
    let feedback: string
    let color: string

    if (score < 40) {
      level = 'weak'
      feedback = 'Weak password - add more variety'
      color = 'hsl(var(--destructive))'
    }
    else if (score < 60) {
      level = 'fair'
      feedback = 'Fair password - could be stronger'
      color = 'hsl(25, 95%, 53%)'
    }
    else if (score < 80) {
      level = 'good'
      feedback = 'Good password'
      color = 'hsl(45, 93%, 47%)'
    }
    else if (score < 100) {
      level = 'strong'
      feedback = 'Strong password'
      color = 'hsl(142, 76%, 36%)'
    }
    else {
      level = 'very-strong'
      feedback = 'Very strong password!'
      color = 'hsl(142, 76%, 36%)'
    }

    return {
      score,
      level,
      feedback,
      checks,
      color,
    }
  }

  /**
   * Validate a single field using Zod schema
   */
  function validateField<T extends keyof RegistrationFormData>(
    field: T,
    value: string,
    formData?: Partial<RegistrationFormData>,
  ): string | null {
    try {
      if (field === 'password') {
        passwordComplexitySchema.parse(value)
        return null
      }

      if (field === 'confirmPassword' && formData?.password) {
        if (value !== formData.password) {
          return 'Passwords do not match'
        }
        return null
      }

      // For other fields, validate individually
      if (field === 'username') {
        baseRegistrationSchema.shape.username.parse(value)
      }
      else if (field === 'email') {
        baseRegistrationSchema.shape.email.parse(value)
      }

      return null
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        return error.errors[0]?.message || 'Invalid input'
      }
      return 'Validation error'
    }
  }

  /**
   * Validate entire form
   */
  function validateForm(data: RegistrationFormData): { success: boolean, errors: Partial<Record<keyof RegistrationFormData, string>> } {
    try {
      registrationSchema.parse(data)
      return { success: true, errors: {} }
    }
    catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Partial<Record<keyof RegistrationFormData, string>> = {}
        error.errors.forEach((err) => {
          const path = err.path[0] as keyof RegistrationFormData
          if (path && !errors[path]) {
            errors[path] = err.message
          }
        })
        return { success: false, errors }
      }
      return { success: false, errors: { username: 'Validation error' } }
    }
  }

  return {
    calculatePasswordStrength,
    validateField,
    validateForm,
    registrationSchema,
    passwordComplexitySchema,
  }
}
