export interface TwoFactorPasswordFormProps {
  actionLabel: string;
  busy: boolean;
  destructive?: boolean;
  submitPassword: (password: string) => Promise<string | undefined>;
}
