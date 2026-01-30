const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Get the project root (apps/mobile)
const projectRoot = __dirname;

// Get the monorepo root
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only the mobile app folder
config.watchFolders = [projectRoot];

// Let Metro know where to resolve packages from monorepo
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure Metro uses the correct root
config.projectRoot = projectRoot;

module.exports = config;
