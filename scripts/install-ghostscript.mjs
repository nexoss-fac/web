import { spawnSync } from 'node:child_process';
import os from 'node:os';

// Render builds on Linux. Install Ghostscript there so fiscal PDFs can be
// compressed before persistence. Local macOS/Windows development is untouched.
if (os.platform() !== 'linux') {
  console.log('[PDF] Instalación de Ghostscript omitida: entorno local no Linux.');
  process.exit(0);
}

const probe = spawnSync('gs', ['--version'], { encoding: 'utf8' });
if (probe.status === 0) {
  console.log(`[PDF] Ghostscript disponible: ${probe.stdout.trim()}`);
  process.exit(0);
}

const apt = spawnSync('apt-get', ['--version'], { encoding: 'utf8' });
if (apt.status !== 0) {
  console.warn('[PDF] No hay apt-get disponible. La app conservará los PDF originales sin comprimir.');
  process.exit(0);
}

console.log('[PDF] Instalando Ghostscript para optimizar los PDF fiscales...');
const update = spawnSync('apt-get', ['update', '-qq'], { stdio: 'inherit', timeout: 180000 });
if (update.status !== 0) {
  console.warn('[PDF] No se pudo actualizar apt. La app conservará los PDF originales sin comprimir.');
  process.exit(0);
}
const install = spawnSync('apt-get', ['install', '-y', '-qq', 'ghostscript'], { stdio: 'inherit', timeout: 180000 });
if (install.status !== 0) {
  console.warn('[PDF] No se pudo instalar Ghostscript. La app conservará los PDF originales sin comprimir.');
  process.exit(0);
}
const verify = spawnSync('gs', ['--version'], { encoding: 'utf8' });
if (verify.status !== 0) {
  console.warn('[PDF] Ghostscript no quedó disponible. La app conservará los PDF originales sin comprimir.');
  process.exit(0);
}
console.log(`[PDF] Ghostscript listo: ${verify.stdout.trim()}`);
