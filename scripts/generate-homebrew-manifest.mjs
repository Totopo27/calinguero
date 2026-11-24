#!/usr/bin/env node
// NOTICE: Modified for the Calinguero project in 2026.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPOSITORY = 'Totopo27/calinguero';
const DEFAULT_BRANCH = 'main';

export function resolveRepository(raw = process.env.GITHUB_REPOSITORY) {
  const candidate = raw == null || raw === '' ? DEFAULT_REPOSITORY : String(raw).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate)) {
    throw new Error(`Invalid repository slug: ${candidate}`);
  }
  const [owner, repo] = candidate.split('/');
  if (
    owner === '.' || owner === '..' || owner.includes('..')
    || repo === '.' || repo === '..' || repo.includes('..')
  ) {
    throw new Error(`Invalid repository slug: ${candidate}`);
  }
  return candidate;
}

export function resolveBranch(raw = process.env.GITHUB_REF_NAME) {
  const candidate = raw == null || raw === '' ? DEFAULT_BRANCH : String(raw).trim();
  if (
    !/^[A-Za-z0-9_./-]+$/.test(candidate)
    || candidate.includes('..')
    || candidate.startsWith('/')
    || candidate.endsWith('/')
    || candidate.includes('//')
    || candidate.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid branch name: ${candidate}`);
  }
  return candidate;
}

export function buildManifest({
  appInfo,
  packageVersion,
  ipkFilename,
  ipkHash,
  repository,
  branch,
}) {
  const repo = resolveRepository(repository);
  const ref = resolveBranch(branch);

  return {
    id: appInfo.id,
    version: packageVersion,
    type: appInfo.type,
    title: appInfo.title,
    appDescription: appInfo.appDescription,
    iconUri: `https://raw.githubusercontent.com/${repo}/${ref}/assets/icon130.png`,
    sourceUrl: `https://github.com/${repo}`,
    rootRequired: false,
    ipkUrl: ipkFilename,
    ipkHash: {
      sha256: ipkHash,
    },
  };
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  const entry = resolve(process.argv[1]);
  const self = resolve(fileURLToPath(import.meta.url));
  return process.platform === 'win32'
    ? entry.toLowerCase() === self.toLowerCase()
    : entry === self;
}

function main() {
  const packageInfo = JSON.parse(readFileSync('package.json', 'utf8'));
  const appInfo = JSON.parse(readFileSync('appinfo.json', 'utf8'));

  if (appInfo.version !== packageInfo.version) {
    throw new Error(
      `Version mismatch: package.json is ${packageInfo.version}, appinfo.json is ${appInfo.version}`,
    );
  }

  const expectedIpk = `${appInfo.id}_${packageInfo.version}_all.ipk`;
  const ipkPath = resolve(process.argv[2] || expectedIpk);
  const outputPath = resolve(process.argv[3] || `${appInfo.id}.manifest.json`);

  if (basename(ipkPath) !== expectedIpk) {
    throw new Error(`Expected IPK filename ${expectedIpk}, received ${basename(ipkPath)}`);
  }

  const ipkHash = createHash('sha256').update(readFileSync(ipkPath)).digest('hex');
  const manifest = buildManifest({
    appInfo,
    packageVersion: packageInfo.version,
    ipkFilename: basename(ipkPath),
    ipkHash,
  });

  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Generated ${basename(outputPath)} for ${basename(ipkPath)}`);
}

if (isDirectExecution()) {
  main();
}
