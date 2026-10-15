"""One-off imports of the user's existing records, one module per menu.

Each reads a JSON file (the real one lives in the git-ignored `private/`
folder), writes into DATABASE_URL (default `saveme_dev`) or `--database-url`
for the local login's user, and is safe to run twice. See
docs/local-operations.md.
"""
