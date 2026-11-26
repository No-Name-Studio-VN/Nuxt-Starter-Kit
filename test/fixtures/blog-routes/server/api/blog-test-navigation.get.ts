import { queryCollectionNavigation } from '@nuxt/content/server';

export default defineEventHandler(async (event) =>
  success({ data: await queryCollectionNavigation(event, 'content') }),
);
