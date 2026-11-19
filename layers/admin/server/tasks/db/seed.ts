export default defineTask({
  meta: {
    name: 'db:seed',
    description: "Run every installed module's seed task",
  },
  async run() {
    console.log('🌱 Starting database seeding...');
    console.log('');

    const { summary, tasks } = await seedDatabase();

    console.log('✅ Database seeding completed');
    console.log('━'.repeat(50));
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
