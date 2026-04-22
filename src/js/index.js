// LookUI - main entry point
// Re-exports all public API so Rollup bundles a single named-export tree

export * from './core/index.js';
export * from './behaviors/index.js';
export * from './components/index.js';
export * from './compossables/index.js';
export { lkDataSource, createDataSource } from './helpers/dataSource.js';

export const version = '0.1.0';
