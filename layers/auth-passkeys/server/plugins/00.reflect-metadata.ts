// WebAuthn's X.509 dependency uses tsyringe during module evaluation, before handlers run.
// Use the same metadata implementation as SimpleWebAuthn's certificate helpers.
import 'reflect-metadata';

export default defineNitroPlugin(() => {});
