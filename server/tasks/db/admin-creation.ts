export default defineTask({
  meta: {
    name: 'db:admin-creation',
    description: 'Seed the database with initial admin account',
  },
  async run() {
    console.log('🌱 Starting database seeding...');
    console.log('');

    const defaultAdminPassword = useRuntimeConfig().defaultAdminPassword;
    if (!defaultAdminPassword) throw new Error('Default admin password is not configured');

    const summary = await seedDatabase(defaultAdminPassword.toString());

    console.log('✅ Database seeding completed');
    console.log('━'.repeat(50));
    console.log('Admin created:', summary.admin.created);
    console.log('Admin verified:', summary.admin.verified);
    // <nsk:feature-flags>
    console.log('Feature flags created:', summary.featureFlags.created);
    console.log('Feature flags skipped:', summary.featureFlags.skipped);
    // </nsk:feature-flags>
    console.log('━'.repeat(50));

    return {
      result: 'Database seeding completed',
      summary,
    };
  },
});
