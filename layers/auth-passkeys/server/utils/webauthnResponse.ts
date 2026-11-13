export function getClientSafeWebAuthnResponse(response: unknown) {
  // Options must keep the WebAuthn wire format. Verification details are server-only;
  // the browser composable only needs the verified flag after either ceremony.
  if (
    response !== null &&
    typeof response === 'object' &&
    'verified' in response &&
    typeof response.verified === 'boolean'
  ) {
    return { verified: response.verified };
  }

  return response;
}
