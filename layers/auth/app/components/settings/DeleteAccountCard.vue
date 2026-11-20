<script setup lang="ts">
import { toast } from 'vue-sonner';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const { t, te } = useI18n();
const { clear } = useUserSession();
const localePath = useAppLocalePath();
const open = ref(false);
const deleting = ref(false);

function updateOpen(value: boolean) {
  if (!deleting.value) open.value = value;
}

async function deleteAccount() {
  if (deleting.value) return;
  deleting.value = true;

  try {
    const response = await apiRequest<ApiResponse<object>>(authRoutes.user(props.profile.id), { method: 'DELETE' });
    if (!response.success) throw response;
  } catch (error) {
    const { message } = parseApiError(error);
    toast.error(t(te(message) ? message : 'account_page.delete_error'));
    deleting.value = false;
    return;
  }

  try {
    await clear();
  } catch {
    toast.error(t('account_page.session_clear_failed'));
  } finally {
    deleting.value = false;
    open.value = false;
    await navigateTo(localePath('/'), { replace: true });
  }
}
</script>

<template>
  <Card class="border-destructive/30">
    <CardHeader>
      <CardTitle class="text-destructive">{{ t('account_page.delete_title') }}</CardTitle>
      <CardDescription>{{ t('account_page.delete_description') }}</CardDescription>
    </CardHeader>
    <CardFooter class="justify-end">
      <AlertDialog :open="open" @update:open="updateOpen">
        <AlertDialogTrigger as-child>
          <Button type="button" variant="destructive" class="w-full sm:w-auto">
            {{ t('account_page.delete_action') }}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ t('account_page.delete_dialog_title') }}</AlertDialogTitle>
            <AlertDialogDescription>{{ t('account_page.delete_dialog_description') }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel :disabled="deleting">{{ t('settings.cancel') }}</AlertDialogCancel>
            <Button type="button" variant="destructive" :disabled="deleting" @click="deleteAccount">
              <Spinner v-if="deleting" data-icon="inline-start" aria-hidden="true" />
              {{ t('account_page.delete_action') }}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardFooter>
  </Card>
</template>
