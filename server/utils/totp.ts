const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

interface TotpOptions {
  issuer: string
  label: string
  secret: string
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31)
      bits -= 5
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31)
  }

  return output
}

function base32Decode(secret: string): Uint8Array {
  const normalized = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return new Uint8Array(bytes)
}

function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8)
  let remaining = counter

  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = remaining & 255
    remaining = Math.floor(remaining / 256)
  }

  return bytes
}

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, message)
  return new Uint8Array(signature)
}

async function generateTotpCode(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret)
  const hmac = await hmacSha1(keyBytes, counterToBytes(counter))
  const offset = hmac[hmac.length - 1] & 15
  const binary = ((hmac[offset] & 127) << 24)
    | ((hmac[offset + 1] & 255) << 16)
    | ((hmac[offset + 2] & 255) << 8)
    | (hmac[offset + 3] & 255)

  return String(binary % 1000000).padStart(6, '0')
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return base32Encode(bytes)
}

export function createTotpUri(options: TotpOptions): string {
  const label = encodeURIComponent(`${options.issuer}:${options.label}`)
  const issuer = encodeURIComponent(options.issuer)
  return `otpauth://totp/${label}?secret=${options.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}

export async function verifyTotpCode(secret: string, code: string, window = 1): Promise<boolean> {
  const currentCounter = Math.floor(Date.now() / 30000)

  for (let offset = -window; offset <= window; offset += 1) {
    const expectedCode = await generateTotpCode(secret, currentCounter + offset)
    if (expectedCode === code) {
      return true
    }
  }

  return false
}

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = new Uint8Array(5)
    crypto.getRandomValues(bytes)
    return base32Encode(bytes).slice(0, 8)
  })
}
