#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();

function log(msg, color = '\x1b[36m') {
  console.log(`${color}${msg}\x1b[0m`);
}

function ok(msg) { log(`✓ ${msg}`, '\x1b[32m'); }
function info(msg) { log(`→ ${msg}`, '\x1b[36m'); }
function warn(msg) { log(`! ${msg}`, '\x1b[33m'); }

log('\n┌─────────────────────────────────────┐');
log('│   NEXUS WHATSAPP AGENT — SETUP       │');
log('└─────────────────────────────────────┘\n');

// 1. Folders
const dirs = ['sessions', 'logs', 'media', 'database'];
for (const d of dirs) {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    ok(`Created ${d}/`);
  } else {
    info(`${d}/ already exists`);
  }
}

// 2. .env
const envPath = path.join(ROOT, '.env');
const envExamplePath = path.join(ROOT, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  ok('Created .env from .env.example');
  warn('→ Edit .env and fill in your API keys before running!');
} else if (fs.existsSync(envPath)) {
  info('.env already exists');
}

// 3. Install deps
const nodeModulesPath = path.join(ROOT, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  info('Installing dependencies (this may take a few minutes)…\n');
  try {
    execSync('npm install', { stdio: 'inherit' });
    ok('Dependencies installed');
  } catch (e) {
    console.error('\n✗ npm install failed. Run it manually.');
    process.exit(1);
  }
} else {
  info('node_modules/ already exists — skipping install');
}

log('\n┌─────────────────────────────────────┐');
log('│   SETUP COMPLETE                    │');
log('└─────────────────────────────────────┘\n');
log('Next steps:');
log('  1. Edit  .env  with your API keys');
log('  2. Run   npm run dev');
log('  3. Scan the QR code with WhatsApp\n');
