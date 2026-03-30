// One-off: remove leftover git merge conflict markers in public HTML files.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'public');

function walkHtml(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtml(p, out);
    else if (ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function stripConflicts(content) {
  // Note: when HEAD is empty, the file often has `<<<<<<< HEAD\n=======\n` (no blank line).
  const re =
    /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)\r?\n>>>>>>>[^\r\n]+\r?\n/g;

  return content.replace(re, (full, head, body) => {
    const h = head.trim();
    const b = body.trim();
    if (h === b) return (head.endsWith('\n') ? head : head + '\n') || full;
    if (!h && /<script[^>]+filters\.js[^>]*>\s*<\/script>/i.test(b)) return '';
    if (!h && /filters\.js/i.test(b)) return '';
    return head ? (head.endsWith('\n') ? head : head + '\n') : '';
  });
}

function main() {
  const files = walkHtml(ROOT);
  let changed = 0;
  for (const f of files) {
    const c = fs.readFileSync(f, 'utf8');
    if (!c.includes('<<<<<<< HEAD')) continue;
    const next = stripConflicts(c);
    if (next !== c) {
      if (next.includes('<<<<<<< HEAD')) {
        console.error('Unresolved conflict remains:', f);
        process.exitCode = 1;
        continue;
      }
      fs.writeFileSync(f, next, 'utf8');
      changed++;
    }
  }
  console.log('Updated', changed, 'HTML files.');
}

main();
