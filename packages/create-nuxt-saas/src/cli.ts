export async function main(_argv: string[]): Promise<number> {
  console.log('Usage: nuxt-saas <command> [options]');
  return 0;
}

export async function runMain(): Promise<void> {
  process.exitCode = await main(process.argv.slice(2));
}
