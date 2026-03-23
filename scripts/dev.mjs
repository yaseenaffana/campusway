import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');

const readEnvValue = (key) => {
  if (!fs.existsSync(envPath)) return '';
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
};

const proxyTarget =
  process.env.VITE_PROXY_TARGET ||
  readEnvValue('VITE_PROXY_TARGET') ||
  process.env.VITE_API_URL ||
  readEnvValue('VITE_API_URL') ||
  'http://localhost:4010';
const normalizedProxyTarget = proxyTarget.replace(/\/$/, '');
const healthUrl = `${normalizedProxyTarget}/health`;

const children = [];
let shuttingDown = false;

const run = (command, args, cwd) => {
  const isWindows = process.platform === 'win32';
  const child = spawn(isWindows ? 'cmd.exe' : command, isWindows ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args, {
    cwd,
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });

  children.push(child);
  return child;
};

const shutdown = (code = 0) => {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkHealth = () =>
  new Promise((resolve) => {
    const client = healthUrl.startsWith('https:') ? https : http;
    const req = client.get(
      healthUrl,
      {
        rejectUnauthorized: false,
        timeout: 2000
      },
      (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

const waitForBackend = async () => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (await checkHealth()) {
      console.log(`[dev] Backend ready at ${healthUrl}`);
      return true;
    }
    if (attempt === 1) {
      console.log(`[dev] Waiting for backend at ${healthUrl}...`);
    }
    await wait(1000);
  }
  return false;
};

const backendAlreadyRunning = await checkHealth();

if (backendAlreadyRunning) {
  console.log(`[dev] Reusing existing backend at ${healthUrl}`);
} else {
  run('npm', ['--prefix', 'backend', 'run', 'dev'], repoRoot);
}

const backendReady = await waitForBackend();
if (!backendReady) {
  console.error(`[dev] Backend did not become ready at ${healthUrl}`);
  shutdown(1);
}

run('npm', ['--prefix', 'frontend', 'run', 'dev'], repoRoot);
