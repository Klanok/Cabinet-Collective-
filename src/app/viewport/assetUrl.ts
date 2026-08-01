/** Resolve a bundled public asset wherever this build is installed or hosted. */
export const bundledAssetUrl = (path: string): string =>
  `./${path.replace(/^\/+/, '')}`;
