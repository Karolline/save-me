# Versioning

The app has one version, `MAJOR.MINOR.PATCH` ([Semantic Versioning](https://semver.org/)), shared by the frontend, the backend and the API contract.

## Which number to raise

| Raise | When | Example |
|---|---|---|
| MAJOR (`1.0.0`) | A change that breaks how the app is used or stored data, or the first public release | Opening signups to everyone |
| MINOR (`0.2.0`) | A new feature or menu | 면접후기, 공고분석 |
| PATCH (`0.1.1`) | A fix, or a small change to how an existing screen behaves | A wrong count in the stats row |

Raising one resets the numbers to its right (`1.2.3` → `1.3.0`).

## Where the version is written

All of these must match. `backend/tests/unit/test_versions.py` fails if they don't.

- `backend/pyproject.toml` (`version`), then run `uv lock` in `backend/` to update `uv.lock`
- `backend/app/main.py` (`FastAPI(..., version=...)`, shown at `/docs`)
- `frontend/package.json`: run `npm version X.Y.Z --no-git-tag-version` in `frontend/` (also updates `package-lock.json`). `vite.config.ts` reads it into `__APP_VERSION__`, shown in the sidebar.

## Releasing a version

1. Add the version and its changes to the top of [`CHANGELOG.md`](../CHANGELOG.md).
2. Update the version in every file above, run only `uv run pytest tests/unit/test_versions.py` (the full suite already passed on `main` after the merge, and the release commit changes only version numbers), and commit (`Release vX.Y.Z`).
3. Tag that commit: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
4. The user updates the local app with `scripts/update.ps1` (backup, rebuild, migrate) and pushes the commit and the tag when they want (`git push && git push --tags`).

Deployment (an image registry and hosted environments) comes later (tech plan step 12); this section grows then.
