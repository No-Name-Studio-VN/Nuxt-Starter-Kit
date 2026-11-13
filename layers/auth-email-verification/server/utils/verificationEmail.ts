import { APP_MANIFEST } from '#shared/constants/manifest';
import { sendEmail } from '#layers/auth/server/utils/email';

export function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<boolean> {
  const APP_NAME = APP_MANIFEST.name;
  const config = useRuntimeConfig();
  const baseUrl = config.public.url;

  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  return sendEmail({
    to,
    subject: `Verify your email - ${APP_NAME}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #111; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.6;">
          Hi <strong>${username}</strong>, thanks for signing up for ${APP_NAME}! Please verify your email address by clicking the button below.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 500; margin: 16px 0 24px;">
          Verify Email
        </a>
        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          If the button doesn't work, copy and paste this link into your browser:<br/>
          <a href="${verifyUrl}" style="color: #555; word-break: break-all;">${verifyUrl}</a>
        </p>
        <p style="color: #888; font-size: 13px;">This link expires in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #aaa; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  });
}
