import path from "path";

/**
 * Resolve absolute path to the root project's config.yaml from the Next.js app.
 */
export function resolveRootConfigPath(): string {
  // The Next.js app runs in web/config-editor; config.yaml is at repo root
  return path.resolve(process.cwd(), "..", "..", "config.yaml");
}


