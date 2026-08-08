import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const fail = (message) => { throw new Error(`发布审计失败：${message}`); };
const assert = (condition, message) => { if (!condition) fail(message); };

const packageJson = readJson('package.json');
const tauriConfig = readJson('src-tauri/tauri.conf.json');
const capability = readJson('src-tauri/capabilities/default.json');
const cargoToml = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

assert(packageJson.version === cargoVersion && cargoVersion === tauriConfig.version,
  `版本不一致：npm=${packageJson.version} Cargo=${cargoVersion ?? 'missing'} Tauri=${tauriConfig.version}`);
assert(tauriConfig.productName === 'Life-OS', 'productName 必须为 Life-OS');
assert(tauriConfig.identifier === 'app.life-os.desktop', 'bundle identifier 必须为 app.life-os.desktop');

const csp = tauriConfig.app?.security?.csp;
assert(typeof csp === 'string' && csp.length > 0, '必须配置 CSP');
for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", 'https:', 'http:']) {
  const normalized = csp.replaceAll('http://ipc.localhost', 'ipc-internal');
  assert(!normalized.includes(forbidden), `CSP 包含禁止源 ${forbidden}`);
}
assert(!/(?:^|[ ;])\*(?:[ ;]|$)/.test(csp), 'CSP 不得使用通配源');

assert(capability.identifier === 'main-window', 'capability identifier 必须为 main-window');
assert(JSON.stringify(capability.windows) === JSON.stringify(['main']), 'capability 只能授权 main 窗口');
assert(JSON.stringify(capability.permissions) === JSON.stringify(['core:default']), 'capability 只能包含 core:default');

const icons = tauriConfig.bundle?.icon;
assert(Array.isArray(icons) && icons.length >= 3, 'bundle 必须显式配置跨平台图标');
for (const icon of icons) {
  assert(typeof icon === 'string' && !icon.includes('..') && !icon.startsWith('/'), `非法图标路径 ${icon}`);
  assert(statSync(join(root, 'src-tauri', icon)).isFile(), `图标不存在 ${icon}`);
}
assert(icons.some((icon) => extname(icon) === '.icns'), '缺少 macOS icns 图标');
assert(icons.some((icon) => extname(icon) === '.ico'), '缺少 Windows ico 图标');
assert(icons.some((icon) => extname(icon) === '.png'), '缺少 PNG 图标');

const dist = join(root, 'dist');
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((path) => ['.html', '.css', '.js'].includes(extname(path)));
assert(files.length >= 3, 'dist 缺少生产 HTML/CSS/JavaScript 产物，请先执行 npm run build');

let gzipTotal = 0;
let largestJs = 0;
let largestCss = 0;
for (const path of files) {
  const content = readFileSync(path);
  gzipTotal += gzipSync(content).byteLength;
  if (extname(path) === '.js') largestJs = Math.max(largestJs, content.byteLength);
  if (extname(path) === '.css') largestCss = Math.max(largestCss, content.byteLength);
}

const limits = { js: 350 * 1024, css: 25 * 1024, gzip: 110 * 1024 };
assert(largestJs <= limits.js, `入口 JavaScript ${largestJs} B 超过 ${limits.js} B`);
assert(largestCss <= limits.css, `CSS ${largestCss} B 超过 ${limits.css} B`);
assert(gzipTotal <= limits.gzip, `HTML/CSS/JS gzip 总量 ${gzipTotal} B 超过 ${limits.gzip} B`);

console.log(`发布审计通过：JS ${largestJs} B，CSS ${largestCss} B，HTML/CSS/JS gzip 总量 ${gzipTotal} B；版本、CSP、capability、identifier 与图标配置一致。`);
