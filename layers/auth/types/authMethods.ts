export interface AuthMethodProps {
  mode: 'login' | 'register';
  redirectTo: string;
  pending: boolean;
}

export interface AuthMethodEmits {
  done: [redirect: string];
  pending: [pending: boolean];
  error: [message: string];
}
