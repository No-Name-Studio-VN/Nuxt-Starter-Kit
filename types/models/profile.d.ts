export interface UserProfileModel {
  id: number
  username: string
  name: string
  createdAt: Date
  lastLoginAt: Date
  hasPassword: boolean
  passkeyCount: number
}
