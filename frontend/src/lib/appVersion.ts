/**
 * The label in the sidebar, e.g. "v1.0.3 (6e10ccd)".
 * Without a commit (local development) it is just the version.
 */
export function formatAppVersion(version: string, commit: string): string {
  const short = commit.trim().slice(0, 7);
  return short ? `v${version} (${short})` : `v${version}`;
}
