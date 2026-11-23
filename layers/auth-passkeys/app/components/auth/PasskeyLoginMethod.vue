<script setup lang="ts">
import PasskeyLoginAlternative from './PasskeyLoginAlternative.vue';
import type { AuthMethodEmits, AuthMethodProps } from '#layers/auth/types/authMethods';

const { redirectTo, pending, rememberedUsername } = defineProps<AuthMethodProps>();
const emit = defineEmits<AuthMethodEmits>();
const username = ref(rememberedUsername ?? '');
</script>

<template>
  <div class="flex flex-col gap-3">
    <Field>
      <FieldLabel for="passkey-username">Username</FieldLabel>
      <Input
        id="passkey-username"
        v-model="username"
        name="username"
        type="text"
        autocomplete="username webauthn"
        autocapitalize="none"
        :spellcheck="false"
        placeholder="Enter your username"
        class="h-10"
        :disabled="pending"
      />
    </Field>
    <PasskeyLoginAlternative
      :username="username"
      :redirect-to="redirectTo"
      :pending="pending"
      @done="emit('done', $event)"
      @pending="emit('pending', $event)"
      @error="emit('error', $event)"
    />
  </div>
</template>
