export async function authenticatePasskey(username: string, authenticate: (username: string) => Promise<boolean | undefined>) {
  const name = username.trim();
  if (!name) return false;
  return await authenticate(name) === true;
}
