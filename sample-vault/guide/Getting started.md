# Getting started

The fastest way to try Marken is with Docker. Mount your Markdown directory as a volume at `/vault`:

```bash
docker run --rm \
  -p 8080:8080 \
  -v "$PWD/my-notes:/vault:ro" \
  marken
```

Open <http://localhost:8080> and you'll see the first document in your vault.

## Configuration

Marken reads the following environment variables:

| Variable             | Default | What it controls                        |
|----------------------|---------|-----------------------------------------|
| `MARKEN_VAULT_PATH`  | `/vault`| The directory Marken reads from         |
| `PORT`               | `8080`  | TCP port to listen on                   |
| `MARKEN_HOST`        | `0.0.0.0` | Address to bind to                    |
| `MARKEN_TITLE`       | `Marken`| Site name shown in the header           |

## URL structure

Every document URL is just the base URL plus the file's path inside the vault, keeping the `.md` extension:

```
https://docs.example.com + notes/meetings/2026-01-15.md
→ https://docs.example.com/view/notes/meetings/2026-01-15.md
```

Raw access (for download or asset embedding) lives under `/raw/`:

```
/raw/notes/meetings/2026-01-15.md   ← the original Markdown source
/raw/images/diagram.png             ← any vault file
```

## Read-only by design

Marken never writes back to the vault. Mount your volume `:ro` if you want belt-and-suspenders.
