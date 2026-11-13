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

    const { summary, tasks } = await seedDatabase(defaultAdminPassword.toString());

    console.log('✅ Database seeding completed');
    console.log('━'.repeat(50));
    console.log('Admin created:', summary.admin.created);
    console.log('Admin verified:', summary.admin.verified);
    for (const task of tasks) {
      for (const [name, count] of Object.entries(task.counts)) {
        console.log(`${task.label} ${name}:`, count);
      }
    }
    console.log('━'.repeat(50));

    return {
      result: 'Database seeding completed',
      summary,
    };
  },
});
