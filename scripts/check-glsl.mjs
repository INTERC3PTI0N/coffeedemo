// The GLSL lives inside JS template literals, so a backtick in a *shader*
// comment silently terminates the literal and the build dies with a parse
// error pointing at whatever happens to follow. It is an easy thing to type
// and a hard one to read back, so it gets a check rather than a habit.
//
// Only comments inside the shader blocks matter: a backtick in the JS comments
// around them is ordinary prose and is left alone.
import fs from 'node:fs';

let bad = 0;
for (const file of ['src/three/resonance.js', 'src/three/postfx.js']) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inShader = false;
  lines.forEach((line, i) => {
    if (!inShader) {
      if (/\/\* glsl \*\/\s*`/.test(line)) inShader = true;
      return;
    }
    if (/^\s*`;/.test(line)) { inShader = false; return; }
    if (/^\s*(\/\/|\*|\/\*)/.test(line) && line.includes('`')) {
      console.error(`${file}:${i + 1}  backtick in a shader comment — ${line.trim()}`);
      bad++;
    }
  });
}
if (bad) {
  console.error(`\n${bad} backtick(s) inside shader comments; each one ends the template literal early.`);
  process.exit(1);
}
console.log('shader comments clean');
