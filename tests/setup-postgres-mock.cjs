// Makes every `require('@vercel/postgres')` anywhere in this process
// resolve to the in-memory mock, without needing a node_modules shim (which
// .gitignore's bare `node_modules` pattern would exclude at any depth) and
// without esbuild inlining a separate copy per bundle (which would give
// each bundled handler its own disconnected state instead of one shared
// in-memory "database"). Must be required before any api/*.ts file is
// bundled+required.
const Module = require('module')
const mock = require('./mock-postgres-impl.cjs')

const VIRTUAL_ID = '\0@vercel/postgres-mock'
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === '@vercel/postgres') return VIRTUAL_ID
  return originalResolveFilename.call(this, request, ...rest)
}
require.cache[VIRTUAL_ID] = {
  id: VIRTUAL_ID,
  filename: VIRTUAL_ID,
  loaded: true,
  exports: { sql: mock.sql },
}

module.exports = Object.assign(mock, { VIRTUAL_ID })
