import fs from 'fs';
const s = fs.readFileSync('src/components/legacy/markup.ts', 'utf8');
for (const id of ['top-bar', 'main-wrap', 'view-auth', 'gbar', 'auth-btn', 'a-email']) {
  console.log(id, s.includes(id));
}
