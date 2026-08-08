/** Resolve a bundled public asset wherever this build is installed or hosted. */
export const bundledAssetUrl = (path: string): string => {
  const relative = path.replace(/^\/+/, '');
  // A single-file demo build (see scripts/inline-build.mjs) hands us the assets as data URIs,
  // because a lone HTML page has no sibling files to fetch.
  const inlined = (globalThis as { __CC_ASSETS__?: Record<string, string> }).__CC_ASSETS__;
  return inlined?.[relative] ?? `./${relative}`;
};
