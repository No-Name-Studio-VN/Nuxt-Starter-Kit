// Sets create-nuxt-saas and Kit Manager to the same version; they are always released together.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: pnpm --dir packages/create-nuxt-saas release:version <x.y.z>');
  process.exit(1);
}

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const projectPath = fileURLToPath(
  new URL('../../kit-manager-macos/KitManager.xcodeproj/project.pbxproj', import.meta.url),
);

const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
const previous = pkg.version;
pkg.version = version;

const project = await readFile(projectPath, 'utf8');
const marketing = /MARKETING_VERSION = [^;]+;/g;
const build = /CURRENT_PROJECT_VERSION = (\d+);/g;
const builds = [...project.matchAll(build)].map((match) => Number(match[1]));
if (builds.length === 0 || !project.match(marketing)) {
  console.error(`No MARKETING_VERSION or CURRENT_PROJECT_VERSION found in ${projectPath}`);
  process.exit(1);
}
// Every release ships a new app build, so the build number moves even when the version is unchanged.
const nextBuild = Math.max(...builds) + 1;

await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile(
  projectPath,
  project
    .replace(marketing, `MARKETING_VERSION = ${version};`)
    .replace(build, `CURRENT_PROJECT_VERSION = ${nextBuild};`),
);

console.log(`create-nuxt-saas ${previous} -> ${version}`);
console.log(`Kit Manager ${version} (build ${nextBuild})`);
