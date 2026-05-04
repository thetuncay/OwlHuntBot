import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const commandsDir = join(process.cwd(), 'dist', 'commands');
const files = await readdir(commandsDir);
const commandFiles = files.filter(n => n.endsWith('.js') && !n.endsWith('.d.ts'));
let count = 0;
for (const f of commandFiles) {
  try {
    const mod = await import(pathToFileURL(join(commandsDir, f)).href);
    // CJS compiled output: mod.default veya mod.default.default
    const cmd = mod.default?.data ? mod.default : mod.default?.default;
    if (cmd?.data?.name) {
      console.log('OK:', f, '->', cmd.data.name);
      count++;
    } else {
      console.log('NO DEFAULT:', f, '| keys:', Object.keys(mod));
    }
  } catch(e) {
    console.log('ERR:', f, e.message);
  }
}
console.log('Total loaded:', count);
