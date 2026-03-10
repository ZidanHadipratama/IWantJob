import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

export default async function globalSetup() {
  const extensionDir = path.resolve(__dirname, "..")
  const buildDir = path.join(extensionDir, "build", "chrome-mv3-prod")
  const manifestPath = path.join(buildDir, "manifest.json")

  if (process.env.PLAYWRIGHT_SKIP_EXTENSION_BUILD === "1" && fs.existsSync(manifestPath)) {
    return
  }

  execFileSync(npmCommand(), ["run", "build"], {
    cwd: extensionDir,
    stdio: "inherit"
  })

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Expected built extension manifest at ${manifestPath}`)
  }
}
