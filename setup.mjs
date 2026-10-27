// Installs dependencies for both repos when they are missing, or runs the backend (--run-backend).
// The venv and node_modules land in paths both repos already gitignore.
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = import.meta.dirname
const backend = join(root, 'supplier-portal-backend')
const frontend = join(root, 'supplier-portal-frontend')
const isWin = process.platform === 'win32'
const venvPython = join(backend, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python')

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin && cmd === 'npm' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const findPython = () => {
  for (const cmd of isWin ? ['py', 'python', 'python3'] : ['python3', 'python']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' })
    if (r.status === 0 && /Python 3/.test(r.stdout + r.stderr)) return cmd
  }
  console.error('Python 3 was not found. Install it from https://www.python.org/downloads/ (tick "Add to PATH").')
  process.exit(1)
}

if (process.argv.includes('--run-backend')) {
  const p = spawn(venvPython, ['app.py'], { cwd: backend, stdio: 'inherit' })
  const stopBackend = () => p.kill('SIGTERM')
  process.on('SIGTERM', stopBackend)
  process.on('SIGINT', stopBackend)
  p.on('exit', (code) => process.exit(code ?? 0))
} else {
  // Backend: create the venv once, reinstall whenever requirements.txt changes.
  if (!existsSync(venvPython)) {
    console.log('[setup] Creating backend virtualenv...')
    run(findPython(), ['-m', 'venv', '.venv'], backend)
  }
  const reqStamp = join(backend, '.venv', '.requirements-installed')
  const reqTime = String(statSync(join(backend, 'requirements.txt')).mtimeMs)
  if (!existsSync(reqStamp) || readFileSync(reqStamp, 'utf8') !== reqTime) {
    console.log('[setup] Installing backend requirements...')
    run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], backend)
    writeFileSync(reqStamp, reqTime)
  }

  // Frontend: npm install when node_modules is missing or older than package-lock.json.
  const modules = join(frontend, 'node_modules', '.package-lock.json')
  const lock = join(frontend, 'package-lock.json')
  if (!existsSync(modules) || statSync(lock).mtimeMs > statSync(modules).mtimeMs) {
    console.log('[setup] Installing frontend packages...')
    run('npm', ['install'], frontend)
  }

  if (!existsSync(join(backend, '.env'))) {
    console.warn('[setup] Warning: supplier-portal-backend/.env is missing; the DB connection will likely fail.')
  }
  console.log('[setup] Dependencies ready.')
}
