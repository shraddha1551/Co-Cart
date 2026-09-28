module.exports = {
  testEnvironment: 'node',
  globalSetup: './tests/globalSetup.js',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 15000,
};
