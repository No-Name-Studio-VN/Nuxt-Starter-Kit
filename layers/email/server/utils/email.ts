import type { SendEmailOptions } from '#layers/email/types/email';

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const config = useRuntimeConfig();
  const resend = config.resend;

  if (!resend?.apiKey || !resend.fromEmail) {
    console.warn('[Email] Resend config not configured, skipping email send');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resend.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error('[Email] Failed to send email:', message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return false;
  }
}
