// Bundles one api/*.ts handler (plus its _lib/* imports) into a throwaway
// CommonJS file with esbuild's JS API, so tests can require() and call the
// exact handler code Vercel would run. `@vercel/postgres` is left
// unresolved at bundle time (external) — setup-postgres-mock.cjs redirects
// every require of it at runtime instead, see that file for why.
const esbuild = require('esbuild')
const os = require('os')
const path = require('path')
const fs = require('fs')

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuri-api-test-'))

function bundle(relativeApiPath) {
  const entry = path.join(__dirname, '..', relativeApiPath)
  const outfile = path.join(outDir, relativeApiPath.replace(/[\\/]/g, '_') + '.js')
  esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['@vercel/postgres', '@vercel/node', '@vercel/blob', '@vercel/blob/client'],
    logLevel: 'silent',
  })
  delete require.cache[require.resolve(outfile)]
  return require(outfile)
}

module.exports = { bundle }
