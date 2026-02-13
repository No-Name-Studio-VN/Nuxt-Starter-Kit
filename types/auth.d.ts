declare module '#auth-utils' {
  interface User {
    id: number
    username: string
    name: string
    isAdmin: boolean
  }

  interface UserSession {
    loggedInAt?: Date
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SecureSessionData {
    // Add your own secure session fields here if needed
  }
}

/**
 * Type for the authenticated user from session
 * Use this when accessing session.user to get proper typing
 */
export type SessionUser = {
  id: number
  username: string
  name: string
}
