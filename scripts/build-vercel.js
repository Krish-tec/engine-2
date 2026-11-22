/**
 * Vercel Build Script for QuantumOrbit Simulator
 * Deploys the pre-compiled, tree-shaken production bundle into public/ for instant CDN hosting.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const simDir = path.join(rootDir, 'outputs', 'sim');
const distDir = path.join(simDir, 'dist');
const publicDir = path.join(rootDir, 'public');

console.log('[Vercel Build] Starting QuantumOrbit Vercel deployment check...');

// Helper to copy directory recursively
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Check if public/ already has the production bundle
const publicIndex = path.join(publicDir, 'index.html');
const publicAssets = path.join(publicDir, 'assets');

if (fs.existsSync(publicIndex) && fs.existsSync(publicAssets)) {
  const assets = fs.readdirSync(publicAssets);
  if (assets.some(a => a.endsWith('.js')) && assets.some(a => a.endsWith('.css'))) {
    console.log('[Vercel Build] Pre-compiled production bundle verified in public/.');
    console.log('[Vercel Build] Assets ready for Vercel Global Edge CDN delivery:');
    assets.slice(0, 8).forEach(a => console.log(`  - assets/${a}`));
    console.log('[Vercel Build] Zero build steps needed — deploying instantly.');
    process.exit(0);
  }
}

// 2. If outputs/sim/dist has the built bundle, copy to public
const distIndex = path.join(distDir, 'index.html');
const distAssets = path.join(distDir, 'assets');
if (fs.existsSync(distIndex) && fs.existsSync(distAssets)) {
  console.log('[Vercel Build] Found bundle in outputs/sim/dist, syncing to public/...');
  copyRecursive(distDir, publicDir);
  console.log('[Vercel Build] Synced to public/ successfully.');
  process.exit(0);
}

// 3. Fallback: Only rebuild if neither exists, using standard npm (never pnpm to avoid URLSearchParams bug)
console.log('[Vercel Build] Pre-built bundle not found, running npm build in outputs/sim...');
try {
  execSync('npm --prefix outputs/sim install --production=false', { cwd: rootDir, stdio: 'inherit' });
  execSync('npm --prefix outputs/sim run build', { cwd: rootDir, stdio: 'inherit' });
  copyRecursive(distDir, publicDir);
  console.log('[Vercel Build] Fallback build completed successfully.');
} catch (err) {
  console.error('[Vercel Build] Fallback build failed:', err.message);
  process.exit(1);
}
