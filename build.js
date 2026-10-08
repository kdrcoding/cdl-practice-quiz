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
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + inline(read('style.css')) + '</style>');
html = html.replace('<script src="questions.js"></script>', () => '<script>\n' + inline(read('questions.js')) + '</script>');
html = html.replace('<script src="app.js"></script>', () => '<script>\n' + inline(read('app.js')) + '</script>');

if (html.includes('src="') || html.includes('href="style.css"')) {
  throw new Error('Build left an external file reference behind.');
}

fs.writeFileSync(path.join(dir, 'CDL-Practice-Quiz.html'), html, 'utf8');
console.log('Wrote CDL-Practice-Quiz.html (' + Buffer.byteLength(html) + ' bytes)');
