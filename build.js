// Builds CDL-Practice-Quiz.html: one file with the CSS and JavaScript inline.
// Run with: node build.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = name => fs.readFileSync(path.join(dir, name), 'utf8');
// Keep inline code from closing its own <script> or <style> tag early.
const inline = text => text.replace(/<\/(script|style)/gi, '<\\/$1');

let html = read('index.html');
// The single file runs its code inline, so the policy allows inline script and style.
html = html.replace("script-src 'self'; style-src 'self'", "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, file) => '<style>\n' + inline(read(file)) + '</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, file) => '<script>\n' + inline(read(file)) + '</script>');

if (/<(script|link)[^>]+src=|href="[a-z]+\.css"/.test(html)) {
  throw new Error('Build left an external file reference behind.');
}

fs.writeFileSync(path.join(dir, 'CDL-Practice-Quiz.html'), html, 'utf8');
console.log('Wrote CDL-Practice-Quiz.html (' + Buffer.byteLength(html) + ' bytes)');
