import TurnstileChallenge from './TurnstileChallenge.vue';

export default defineNuxtPlugin(() => {
  registerExtension('form:challenge', { id: 'turnstile', order: 0, component: TurnstileChallenge });
});
