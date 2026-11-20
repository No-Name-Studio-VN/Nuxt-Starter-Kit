export interface AuthMethodProps {
  mode: 'login' | 'register';
  redirectTo: string;
  pending: boolean;
  rememberedUsername?: string;
}

export interface AuthMethodEmits {
  done: [redirect: string];
  pending: [pending: boolean];
  error: [message: string];
}

export interface AuthMethodEmitter {
  (event: 'done', ...args: AuthMethodEmits['done']): void;
  (event: 'pending', ...args: AuthMethodEmits['pending']): void;
  (event: 'error', ...args: AuthMethodEmits['error']): void;
}
