#!/usr/bin/env node
// Fails if package.json's version and openapi/openapi.yaml's info.version
// have drifted apart. This is exactly what let openapi.yaml sit at 0.2.0
// while the published package moved on to 0.4.2 -- nothing ever checked
// the two stayed in sync, so it just silently didn't.
//
// Deliberately dependency-free (no js-yaml): the package has no YAML
// parser as a dependency today, and openapi/openapi.yaml's `info:`
// block is simple enough that a small scoped regex is more honest here
// than pulling in a parser for one field. If openapi/openapi.yaml's
// `info:` block ever grows nested `version:`-like keys before the next
// top-level key, switch this to a real YAML parser instead of widening
// the regex.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packageVersion = pkg.version;

const openapiPath = join(rootDir, 'openapi', 'openapi.yaml');
const openapiSource = readFileSync(openapiPath, 'utf8');

// Scope the search to the `info:` block only (from the `info:` line up
// to the next line that starts a new top-level key), so a `version:`
// appearing anywhere else in the spec later can't be matched by
// accident.
const infoBlockMatch = openapiSource.match(/^info:\n([\s\S]*?)(?=\n[^\s#][^\n]*:\n|\n[^\s#][^\n]*:$)/m);
if (!infoBlockMatch) {
  console.error('check-version-sync: could not locate an `info:` block in openapi/openapi.yaml.');
  process.exit(1);
}

const versionMatch = infoBlockMatch[1].match(/^\s+version:\s*["']?([^"'\s#]+)["']?\s*$/m);
if (!versionMatch) {
  console.error('check-version-sync: could not find `version:` inside openapi.yaml\'s info block.');
  process.exit(1);
}
const openapiVersion = versionMatch[1];

if (packageVersion !== openapiVersion) {
  console.error(
    `check-version-sync: package.json is at ${packageVersion} but openapi/openapi.yaml ` +
    `info.version is at ${openapiVersion}. Bump whichever one is behind -- these two are ` +
    'supposed to always match.',
  );
  process.exit(1);
}

console.log(`check-version-sync: package.json and openapi.yaml both at ${packageVersion}. OK.`);
