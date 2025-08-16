#!/usr/bin/env node
// Simple guard to avoid starting Next.js without a production build.
// It respects the user's preference not to auto-build.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const appDir = join(process.cwd(), 'web', 'config-editor')
const buildIdFile = join(appDir, '.next', 'BUILD_ID')

if (!existsSync(buildIdFile)) {
  console.error(
    "No production build found for web/config-editor. Run 'pnpm web:build' first (which runs 'pnpm -C web/config-editor build')."
  )
  process.exit(1)
}

