#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const violations = [];

if (typeof packageJson.name !== 'string' || !packageJson.name.startsWith('@apicenter/')) {
  violations.push('Package name must remain under the @apicenter scope.');
}

if (packageJson.private === true) {
  violations.push('Package must be publishable, so package.json private=true is not allowed.');
}

const allowedAccessValues = new Set(['restricted', 'public']);
if (!allowedAccessValues.has(packageJson.publishConfig?.access)) {
  violations.push('publishConfig.access must be set to "restricted" (private registry) or "public" (npm public registry).');
}

if (violations.length > 0) {
  console.error('\nSDK publish guard failed:\n');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('SDK publish guard passed.');
