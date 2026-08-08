/**
 * Fold a `vite build` into one self-contained HTML file.
 *
 * Hosted demo pages (and the phone that opens them) get a single document with no
 * sibling requests: the CSS, the JS bundle and every texture under public/materials
 * ride along as inline text or data URIs.
 *
 * Usage: npm run build && node scripts/inline-build.mjs [outfile]
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const outFile = process.argv[2] ?? join(dist, 'cabinet-collective-standalone.html');

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** Every file under dist/materials, keyed by the path the app asks for. */
async function collectAssets(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const assets = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath ?? entry.path, entry.name);
    const mime = MIME[extname(entry.name).toLowerCase()];
    if (!mime) continue;
    const key = relative(dist, abs).split('\\').join('/');
    assets[key] = `data:${mime};base64,${(await readFile(abs)).toString('base64')}`;
  }
  return assets;
}

const html = await readFile(join(dist, 'index.html'), 'utf8');
const cssHref = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
const jsSrc = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
if (!jsSrc) throw new Error('No bundle found in dist/index.html — run `npm run build` first.');

const resolve = (href) => join(dist, href.replace(/^\.?\//, ''));
const css = cssHref ? await readFile(resolve(cssHref), 'utf8') : '';
const js = await readFile(resolve(jsSrc), 'utf8');
const assets = await collectAssets(join(dist, 'materials'));

// `</script>` inside the bundle's string literals would close the tag we are writing it into.
const escapeForScriptTag = (source) => source.replace(/<\/script/gi, '<\\/script');

const page = `<title>Cabinet Collective</title>
<meta name="viewport" content="width=1280, initial-scale=0.3" />
<style>${css}</style>
<script>globalThis.__CC_ASSETS__ = ${escapeForScriptTag(JSON.stringify(assets))};</script>
<div id="root"></div>
<script type="module">${escapeForScriptTag(js)}</script>
`;

await writeFile(outFile, page);
const mb = (Buffer.byteLength(page) / 1024 / 1024).toFixed(2);
console.log(`${relative(root, outFile)} — ${mb} MB, ${Object.keys(assets).length} assets inlined`);
