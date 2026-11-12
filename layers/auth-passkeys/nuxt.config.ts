export default defineNuxtConfig({
  auth: {
    webAuthn: true,
  },
  // nuxt-security's strict default blocks WebAuthn (publickey-credentials-get=()).
  security: {
    headers: {
      permissionsPolicy: {
        'publickey-credentials-get': ['self'],
        'publickey-credentials-create': ['self'],
      },
    },
  },
});
