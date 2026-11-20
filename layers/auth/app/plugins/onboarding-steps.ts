import PreferencesStep from '../components/onboarding/PreferencesStep.vue';
import UsernameStep from '../components/onboarding/UsernameStep.vue';

export default defineNuxtPlugin(() => {
  registerExtension('onboarding:steps', { id: 'username', order: 100, component: UsernameStep });
  registerExtension('onboarding:steps', { id: 'preferences', order: 900, component: PreferencesStep });
});
