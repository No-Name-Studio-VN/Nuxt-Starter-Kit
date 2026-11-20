import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

const writeFile = fs.writeFile;
fs.writeFile = async (path, ...args) => {
  if (path === process.env.TEST_APPLY_PATH) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      process.once('SIGTERM', () => {
        clearTimeout(timeout);
        setImmediate(resolve);
      });
      process.send('applying');
    });
  }
  return writeFile(path, ...args);
};
syncBuiltinESMExports();
