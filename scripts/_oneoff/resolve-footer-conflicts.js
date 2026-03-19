import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

function resolveConflicts(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      resolveConflicts(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;

      if (content.includes('<<<<<<< HEAD')) {
        content = content.replace(
          /<<<<<<< HEAD\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)>>>>>>> [^\n]+\n?/g,
          '$1'
        );

        if (content !== original) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log('Resolved: ' + path.relative(PUBLIC_DIR, fullPath));
        }
      }
    }
  }
}

console.log('Resolving footer conflicts...');
resolveConflicts(PUBLIC_DIR);
console.log('Done!');
