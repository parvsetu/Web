// `npm test` = unit tests + e2e tests (e2e needs the docker Postgres; see README).
module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      transform: { '^.+\\.ts$': 'ts-jest' },
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
    (({ testTimeout: _t, ...e2e }) => ({ ...e2e, displayName: 'e2e', rootDir: '.' }))(require('./test/jest-e2e.config.js')),
  ],
};
