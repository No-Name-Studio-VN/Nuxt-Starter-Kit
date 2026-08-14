export interface GoogleIdTokenPayload {
  issuer: string;
  audience: string;
  subject: string;
  email: string;
  emailVerified: true;
  name: string;
  picture?: string;
  issuedAt: number;
  expiresAt: number;
}

export interface GoogleJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

export interface GoogleSignatureVerificationInput {
  signingInput: string;
  signature: Uint8Array;
  jwk: GoogleJwk;
}

export type GoogleSignatureVerifier = (input: GoogleSignatureVerificationInput) => Promise<boolean>;

export interface VerifyGoogleIdTokenInput {
  token: string;
  audience: string;
  now?: Date;
  loadJwks?: () => Promise<GoogleJwk[]>;
  verifySignature?: GoogleSignatureVerifier;
}

export interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}
