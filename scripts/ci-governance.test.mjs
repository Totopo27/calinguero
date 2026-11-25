import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  resolveBranch,
  resolveRepository,
} from './generate-homebrew-manifest.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('CI and fork governance', () => {
  it('removes automatic GitHub Pages publishing, unreferenced pages renderer, and upstream Homebrew repository catalog', () => {
    expect(existsSync(resolve(repoRoot, '.github/workflows/github-pages.yml'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'homebrew-repository.json'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'scripts/render-github-pages.mjs'))).toBe(false);
  });

  it('hardens build.yml permissions, triggers, actions, and release steps', () => {
    const workflow = readFileSync(resolve(repoRoot, '.github/workflows/build.yml'), 'utf8');

    expect(workflow).toContain('# NOTICE: Modified for the Calinguero project in 2026.');
    expect(workflow).toMatch(/^\s*permissions:\s*\r?\n\s*contents:\s*read\b/m);
    expect(workflow).not.toMatch(/\bcontents:\s*write\b/);
    expect(workflow).not.toMatch(/\bpages:\s*write\b/);
    expect(workflow).not.toMatch(/\bid-token:\s*write\b/);
    expect(workflow).not.toMatch(/^\s*tags:/m);
    expect(workflow).not.toContain('softprops/action-gh-release');
    expect(workflow).not.toContain('npm run manifest');

    const usesMatches = Array.from(workflow.matchAll(/uses:\s*([^\s#]+)/g), (m) => m[1]);
    expect(usesMatches.length).toBeGreaterThan(0);
    for (const ref of usesMatches) {
      expect(ref, `action reference "${ref}" must be pinned to a 40-char SHA`).toMatch(
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/,
      );
    }

    expect(workflow).toMatch(/^\s*check:\s*$/m);
    expect(workflow).toMatch(/^\s*e2e:\s*$/m);
    expect(workflow).toMatch(/^\s*package:\s*$/m);
    expect(workflow).toContain('npm run typecheck:all');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run test:e2e');
    expect(workflow).toContain('npm run service:smoke:matrix');
    expect(workflow).toContain('node esbuild.config.mjs');
    expect(workflow).toContain('ares-package');
    expect(workflow).toContain('name: calinguero-m0-ipk');
    expect(workflow).toContain('path: "*.ipk"');
  });

  it('validates repository/branch inputs and builds manifests without upstream URLs', () => {
    const defaultRepo = resolveRepository(undefined);
    expect(defaultRepo).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    expect(defaultRepo).not.toContain('webos-iptv-player');

    expect(resolveRepository('example-org/example-app')).toBe('example-org/example-app');
    expect(() => resolveRepository('invalid repo!')).toThrow();
    expect(() => resolveRepository('../bad')).toThrow();

    expect(resolveBranch('main')).toBe('main');
    expect(resolveBranch('release/v1.0')).toBe('release/v1.0');
    expect(() => resolveBranch('../bad')).toThrow();
    expect(() => resolveBranch('.')).toThrow();
    expect(() => resolveBranch('a/./b')).toThrow();
    expect(() => resolveBranch('a//b')).toThrow();
    expect(() => resolveBranch('/leading-slash')).toThrow();
    expect(() => resolveBranch('trailing-slash/')).toThrow();

    const manifest = buildManifest({
      appInfo: {
        id: 'com.example.app',
        type: 'web',
        title: 'Example Player',
        appDescription: 'Example description',
      },
      packageVersion: '1.0.0',
      ipkFilename: 'com.example.app_1.0.0_all.ipk',
      ipkHash: 'a'.repeat(64),
      repository: 'example-org/example-app',
      branch: 'main',
    });

    expect(manifest).toEqual({
      id: 'com.example.app',
      version: '1.0.0',
      type: 'web',
      title: 'Example Player',
      appDescription: 'Example description',
      iconUri: 'https://raw.githubusercontent.com/example-org/example-app/main/assets/icon130.png',
      sourceUrl: 'https://github.com/example-org/example-app',
      rootRequired: false,
      ipkUrl: 'com.example.app_1.0.0_all.ipk',
      ipkHash: {
        sha256: 'a'.repeat(64),
      },
    });
  });

  it('documents Apache-2.0 modification notices on README.md, AGENTS.md, and docs/lan-service.md', () => {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    expect(readme).toMatch(/README\.md[\s\S]*### Tests/);
    expect(readme).toContain('2026 modification notices');

    const agents = readFileSync(resolve(repoRoot, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('<!-- NOTICE: Modified for the Calinguero project in 2026. -->');

    const lanDoc = readFileSync(resolve(repoRoot, 'docs/lan-service.md'), 'utf8');
    expect(lanDoc).toContain('<!-- NOTICE: Modified for the Calinguero project in 2026. -->');
  });

  it('runs the CLI entrypoint with valid env overrides and rejects invalid GITHUB_REPOSITORY', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'ci-gov-manifest-'));
    try {
      const ipkName = 'com.example.app_1.0.0_all.ipk';
      const outName = 'com.example.app.manifest.json';
      writeFileSync(join(workDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
      writeFileSync(
        join(workDir, 'appinfo.json'),
        JSON.stringify({
          id: 'com.example.app',
          version: '1.0.0',
          type: 'web',
          title: 'Example Player',
          appDescription: 'Example description',
        }),
      );
      writeFileSync(join(workDir, ipkName), 'synthetic-ipk-bytes');

      const runCli = (envOverrides) => spawnSync(
        process.execPath,
        [resolve(repoRoot, 'scripts/generate-homebrew-manifest.mjs'), ipkName, outName],
        {
          cwd: workDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            ...envOverrides,
          },
        },
      );

      const okResult = runCli({
        GITHUB_REPOSITORY: 'example-org/example-app',
        GITHUB_REF_NAME: 'main',
      });
      expect(okResult.status).toBe(0);
      expect(okResult.stdout).toContain(`Generated ${outName} for ${ipkName}`);
      const written = JSON.parse(readFileSync(join(workDir, outName), 'utf8'));
      expect(written.iconUri).toBe(
        'https://raw.githubusercontent.com/example-org/example-app/main/assets/icon130.png',
      );
      expect(written.sourceUrl).toBe('https://github.com/example-org/example-app');
      expect(written.ipkUrl).toBe(ipkName);

      const badResult = runCli({
        GITHUB_REPOSITORY: 'invalid repo!',
        GITHUB_REF_NAME: 'main',
      });
      expect(badResult.status).not.toBe(0);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
