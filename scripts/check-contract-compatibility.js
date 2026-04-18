#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const contractPath = path.join(repoRoot, 'contracts', 'shared-service-contract.json');
const tribeClientPath = path.join(repoRoot, 'src', 'TribeClient.ts');

const violations = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFileExists(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    violations.push(`Missing required file: ${relativePath}`);
    return null;
  }

  return absolutePath;
}

function ensureContractAndWrappers(contract) {
  const tribeClientSource = fs.readFileSync(tribeClientPath, 'utf8');

  for (const service of contract.sharedServices || []) {
    const manifestPath = assertFileExists(service.manifest);
    if (!manifestPath) {
      continue;
    }

    const manifest = readJson(manifestPath);
    if (manifest.serviceId !== service.serviceId) {
      violations.push(
        `Manifest serviceId mismatch for ${service.manifest}: expected '${service.serviceId}', got '${manifest.serviceId}'`,
      );
    }

    for (const wrapperName of service.wrappers || []) {
      if (!tribeClientSource.includes(`async ${wrapperName}(`)) {
        violations.push(`Missing wrapper method in TribeClient: ${wrapperName}`);
      }
    }
  }

  for (const wrapperName of contract.kafkaGovernance?.wrappers || []) {
    if (!tribeClientSource.includes(`async ${wrapperName}(`)) {
      violations.push(`Missing Kafka governance wrapper in TribeClient: ${wrapperName}`);
    }
  }

  if (!tribeClientSource.includes("'/api/v1/kafka/publish'")) {
    violations.push('TribeClient is missing governed Kafka publish route integration (/api/v1/kafka/publish).');
  }

  if (!tribeClientSource.includes("'/api/v1/kafka/governance'")) {
    violations.push('TribeClient is missing Kafka governance catalog route integration (/api/v1/kafka/governance).');
  }
}

function main() {
  assertFileExists('contracts/shared-service-contract.json');
  assertFileExists('src/TribeClient.ts');

  if (violations.length > 0) {
    printAndExit();
    return;
  }

  const contract = readJson(contractPath);
  ensureContractAndWrappers(contract);
  printAndExit();
}

function printAndExit() {
  if (violations.length === 0) {
    console.log('Contract compatibility check passed.');
    process.exit(0);
  }

  console.error('\nContract compatibility check failed:\n');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

main();
