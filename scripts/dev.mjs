// `npm run dev` faz tudo: instala o que faltar, sobe o MySQL (Docker), aplica o schema do Prisma,
// roda o seed e inicia API + painel (o WhatsApp/bot roda dentro da API em desenvolvimento).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';
const c = { blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m', red: '\x1b[31m', green: '\x1b[32m', reset: '\x1b[0m' };
const log = (m) => console.log(`${c.green}[pixel]${c.reset} ${m}`);
const fail = (m) => { console.error(`${c.red}[pixel] ${m}${c.reset}`); process.exit(1); };

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Node ${process.versions.node} é antigo demais. Use Node 20 ou superior (recomendado: 22).`);

function run(cmd, args, cwd = root, label = cmd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`Falhou: ${label} ${args.join(' ')}`);
}

// 1. .env
if (!existsSync(path.join(root, '.env'))) {
  copyFileSync(path.join(root, '.env.example'), path.join(root, '.env'));
  log('.env criado a partir do .env.example');
}

// Repassa o .env da raiz para tudo que for iniciado daqui (Prisma, API, painel)
import { readFileSync } from 'node:fs';
for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// Já tem uma instância rodando? Ela segura o arquivo do Prisma (erro EPERM) e ocupa as portas: avisa em vez de falhar.
const apiPort = process.env.PORT || 3100;
const alive = await fetch(`http://localhost:${apiPort}/api/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
if (alive) {
  console.log(`${c.green}[pixel]${c.reset} O sistema já está rodando: abra http://localhost:3000 (API na porta ${apiPort}).`);
  console.log(`${c.gray}Para reiniciar: feche o terminal que o iniciou (Ctrl+C) e rode \`npm run dev\` de novo. Se não achar qual terminal, encerre o processo que usa as portas 3000 e ${apiPort}.${c.reset}`);
  process.exit(0);
}

// 2. dependências
for (const dir of ['.', 'back', 'front']) {
  if (!existsSync(path.join(root, dir, 'node_modules'))) {
    log(`Instalando dependências em ${dir === '.' ? 'raiz' : dir}…`);
    run(npm, ['install'], path.join(root, dir), 'npm');
  }
}

// 3. banco (Docker)
const docker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: isWin });
if (docker.status !== 0) fail('O Docker não está rodando. Abra o Docker Desktop e rode `npm run dev` de novo.');
log('Subindo o MySQL no Docker…');
run('docker', ['compose', 'up', '-d', '--wait', 'db'], root, 'docker');

// 4. schema + seed
const back = path.join(root, 'back');
log('Aplicando o schema do Prisma…');
run(npx, ['prisma', 'db', 'push', '--skip-generate'], back, 'prisma');
run(npx, ['prisma', 'generate'], back, 'prisma');
log('Rodando o seed (só cria o que ainda não existe)…');
run(npx, ['tsx', 'prisma/seed.ts'], back, 'seed');

// 5. API + painel
const procs = [];
function start(name, color, cwd, args) {
  const p = spawn(npm, args, { cwd, shell: isWin, env: process.env });
  const out = (stream, dst) => stream.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => dst.write(`${color}[${name}]${c.reset} ${l}\n`)));
  out(p.stdout, process.stdout); out(p.stderr, process.stderr);
  p.on('exit', (code) => { if (!stopping) { console.error(`${c.red}[${name}] encerrou (código ${code})${c.reset}`); stop(code ?? 1); } });
  procs.push(p);
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const p of procs) { try { isWin ? spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }) : p.kill('SIGTERM'); } catch {} }
  process.exit(code);
}
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));

log('Iniciando API e painel…');
start('API', c.blue, back, ['run', 'dev']);
start('PAINEL', c.cyan, path.join(root, 'front'), ['run', 'dev']);
setTimeout(() => log(`Pronto! Painel: http://localhost:3000  ·  API: http://localhost:${process.env.PORT || 3100}  ·  login: ${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`), 4000);
