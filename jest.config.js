module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  clearMocks: true,
  // Every suite boots a jsdom, so a worker's peak heap is large and the default
  // worker count (cores - 1) scales it with the machine: on a 16-core box that is
  // 15 jsdom heaps at once, and V8 starts refusing allocations ("Committing semi
  // space failed", "young object promotion failed"). Jest reports those workers as
  // "terminated by another process: SIGTERM" with zero failing tests, and
  // build.py's gate then refuses (correctly) to build on a suite it could not run.
  // Halving the workers keeps the whole suite under 8 s while staying inside the
  // memory budget; the idle limit recycles a worker that has grown between files
  // instead of letting it carry its peak into the next one. CI runners have 2-4
  // cores, so 50% is 1-2 workers there and the wall-clock is unchanged.
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/lz-string.min.js',
  ],
};
