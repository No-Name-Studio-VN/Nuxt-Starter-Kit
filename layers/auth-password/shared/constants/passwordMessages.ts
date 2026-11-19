export const PASSWORD_ERROR_MESSAGES = {
  // Registration errors
  captcha: 'Security verification failed. Please refresh the page and try again.',
  existed: 'This username is already taken. Please choose a different username.',
  'email-existed': 'This email is already in use. Please choose a different email.',

  // Login errors
  'invalid-credentials':
    'Invalid username or password. Please check your credentials and try again.',

  // Password reset errors
  'reset-invalid-token': 'This reset link is invalid or has already been used.',
  'reset-token-expired': 'This reset link has expired. Please request a new one.',
};

export const PASSWORD_SUCCESS_MESSAGES = {
  'password-reset': 'Your password has been reset. You can now sign in with your new password.',
  'reset-link-sent': "If an account exists with that email, we've sent a password reset link.",
};
