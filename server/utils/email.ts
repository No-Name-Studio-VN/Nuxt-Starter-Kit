import { APP_MANIFEST } from '#shared/constants/manifest'
import type { H3Event } from 'h3'

interface AuthEmailLink {
  url: string
  expiresIn: string
}

interface AuthEmailSendResult {
  sent: boolean
  configured: boolean
}

function getPublicBaseUrl(event: H3Event) {
  const config = useRuntimeConfig()
  const configuredUrl = typeof config.public?.url === 'string' ? config.public.url : ''

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  return getRequestURL(event).origin
}

function buildAuthLink(event: H3Event, path: string, token: string): AuthEmailLink {
  const url = new URL(path, getPublicBaseUrl(event))
  url.searchParams.set('token', token)

  return {
    url: url.toString(),
    expiresIn: path.includes('reset-password') ? '1 hour' : '24 hours',
  }
}

async function sendAuthEmail(kind: 'verification' | 'password-reset', to: string, username: string, link: AuthEmailLink): Promise<AuthEmailSendResult> {
  const title = kind === 'verification' ? 'Verify your email' : 'Reset your password'
  const action = kind === 'verification' ? 'verify your email address' : 'reset your password'

  console.info('[Email] Configure server/utils/email.ts with your email provider to send this message.', {
    to,
    subject: `${title} - ${APP_MANIFEST.name}`,
    previewText: `Hi ${username}, use ${link.url} to ${action}. This link expires in ${link.expiresIn}.`,
  })

  return { sent: false, configured: false }
}

export function sendVerificationEmail(event: H3Event, to: string, username: string, token: string): Promise<AuthEmailSendResult> {
  const link = buildAuthLink(event, '/api/auth/verify-email', token)
  return sendAuthEmail('verification', to, username, link)
}

export function sendPasswordResetEmail(event: H3Event, to: string, username: string, token: string): Promise<AuthEmailSendResult> {
  const link = buildAuthLink(event, '/auth/reset-password', token)
  return sendAuthEmail('password-reset', to, username, link)
}
