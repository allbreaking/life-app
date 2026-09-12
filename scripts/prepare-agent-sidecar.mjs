import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const tauri = join(root, 'src-tauri');

/** Side effects: executes trusted local Rust toolchain commands and writes only the target-specific bundled sidecar file. */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

const host = run('rustc', ['-vV']).match(/^host:\s*(\S+)$/m)?.[1];
if (!host || !/^[a-zA-Z0-9_.-]+$/.test(host)) throw new Error('无法识别受信任的 Rust host triple');
const executable = process.platform === 'win32' ? 'life-os-mcp.exe' : 'life-os-mcp';
const bundled = process.platform === 'win32' ? `life-os-mcp-${host}.exe` : `life-os-mcp-${host}`;
const source = join(tauri, 'target', 'release', executable);
const destination = join(tauri, 'binaries', bundled);
mkdirSync(dirname(destination), { recursive: true });
// Tauri's build script validates externalBin before Cargo has produced this binary.
if (!existsSync(destination)) writeFileSync(destination, 'pending sidecar build\n');
run('cargo', ['build', '--release', '--manifest-path', join(tauri, 'Cargo.toml'), '--bin', 'life-os-mcp']);
copyFileSync(source, destination);
console.log(`Life-OS MCP sidecar 已准备：src-tauri/binaries/${bundled}`);
