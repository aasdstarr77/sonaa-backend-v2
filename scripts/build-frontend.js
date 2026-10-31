'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend');
const output = path.join(root, 'frontend-dist');
const toolsDir = path.join(os.tmpdir(), 'sonaa-frontend-build-tools');
const modules = path.join(toolsDir, 'node_modules');

function ensureTools() {
  const packages = [
    'html-minifier-terser@7.2.0',
    'terser@5.43.1',
    'clean-css@5.3.3'
  ];
  const marker = path.join(modules, 'html-minifier-terser', 'package.json');
  const terserMarker = path.join(modules, 'terser', 'package.json');
  const cssMarker = path.join(modules, 'clean-css', 'package.json');
  if (fs.existsSync(marker) && fs.existsSync(terserMarker) && fs.existsSync(cssMarker)) return;
  fs.mkdirSync(toolsDir, { recursive: true });
  execFileSync('npm', [
    'install', '--prefix', toolsDir, '--no-save', '--no-package-lock',
    '--ignore-scripts', ...packages
  ], { stdio: 'inherit' });
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.isFile() ? [full] : [];
  });
}

async function main() {
  if (!fs.existsSync(source)) throw new Error('frontend source directory not found');
  ensureTools();
  const { minify: minifyHtml } = require(path.join(modules, 'html-minifier-terser'));
  const { minify: minifyJs } = require(path.join(modules, 'terser'));
  const CleanCSS = require(path.join(modules, 'clean-css'));

  fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(source, output, { recursive: true });
  // Keep archival backups in the source repository, never publish them as live pages.
  for (const file of walk(output).filter(file => /\.backup\.html$/i.test(file))) {
    fs.rmSync(file, { force: true });
  }

  const sourceFiles = walk(output);
  let before = 0;
  let after = 0;
  let htmlCount = 0;
  let jsCount = 0;
  let cssCount = 0;

  for (const file of sourceFiles) {
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.js', '.css'].includes(ext)) continue;
    const original = fs.readFileSync(file, 'utf8');
    let minified;
    if (ext === '.html') {
      minified = await minifyHtml(original, {
        collapseWhitespace: true,
        conservativeCollapse: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        keepClosingSlash: true,
        caseSensitive: true,
        continueOnParseError: false
      });
      htmlCount++;
    } else if (ext === '.js') {
      const result = await minifyJs(original, {
        compress: true,
        mangle: true,
        format: { comments: false },
        ecma: 2020
      });
      if (result.error) throw result.error;
      minified = result.code;
      jsCount++;
    } else {
      const result = new CleanCSS({ level: 2 }).minify(original);
      if (result.errors && result.errors.length) throw new Error(result.errors.join('\n'));
      minified = result.styles;
      cssCount++;
    }
    fs.writeFileSync(file, minified, 'utf8');
    before += Buffer.byteLength(original);
    after += Buffer.byteLength(minified);
  }

  const percent = before ? ((1 - after / before) * 100).toFixed(1) : '0.0';
  console.log(`Sonaa frontend build complete: ${htmlCount} HTML, ${jsCount} JS, ${cssCount} CSS files; ${before} -> ${after} bytes (${percent}% smaller before HTTP compression).`);
}

main().catch(error => {
  console.error('Sonaa frontend minification failed:', error);
  process.exitCode = 1;
});
