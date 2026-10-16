#!/usr/bin/env node
// Runs every tests/*.test.cjs file against the real API handler code,
// bundled with esbuild and backed by an in-memory Postgres mock (see
// tests/README.md). No real network calls, no real DB, no CI secrets
// required — every external call (Gemini, Resend) a test exercises is
// mocked within that test file.
const fs = require('fs')
const path = require('path')

const testsDir = path.join(__dirname, '..', 'tests')
const files = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.cjs'))
  .sort()

async function main() {
  let allOk = true
  for (const file of files) {
    console.log(`\n=== ${file} ===`)
    const { run } = require(path.join(testsDir, file))
    const ok = await run()
    if (!ok) allOk = false
  }
  if (!allOk) {
    console.error('\nSome tests failed.')
    process.exit(1)
  }
  console.log('\nAll tests passed.')
}

main().catch((err) => {
  console.error('Test runner crashed:', err)
  process.exit(1)
})
