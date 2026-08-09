# Soma Search for Obsidian

Soma Search brings [Soma](https://github.com/AwesomeDog/soma) into Obsidian as a private, local search experience. It adds a familiar search sidebar and manages a dedicated Soma instance for the current vault.

## Folders are not memory

Memory returns as a phrase, an image, or a half-formed question, rarely as a file path. Soma Search gives every fragment an honest way back.

It makes more than text searchable:

- **PDF documents** - extracts embedded text
- **Scanned or image-based content** - reads text with OCR
- **Images and other visual content** - understands content through vision extraction
- **Recorded media** - turns speech into searchable text

Everything joins the same index and can be found with Semantic, Keyword, or Hybrid search.

## Local and private

Soma performs extraction, indexing, and inference on your machine. The plugin sends vault content and search queries only to the Soma instance running on your machine, not to a cloud search service.

The plugin starts `soma server --port=<available-port> --auto-sync --no-color` when you initialize Soma or perform the first search in an initialized vault. The instance listens only on a dynamically selected port at `127.0.0.1`, synchronizes immediately and then hourly, and stops when the plugin is unloaded. All search requests go directly to this local instance.

## Requirements

- Obsidian desktop 1.13.0 or later with a local filesystem vault
- Soma installed locally; when no full path is configured, the plugin tries common locations
- At least 8 GB of RAM; multimedia extraction may require 24 GB while active
- Network access when Soma needs to download models or helper programs

Install Soma with:

```shell
# on Windows
winget install AwesomeDog.soma
# on macOS
brew tap AwesomeDog/tap && brew trust AwesomeDog/tap && brew install AwesomeDog/tap/soma
# on Linux
curl -fsSL https://github.com/AwesomeDog/soma/releases/latest/download/soma-linux-x64 -o soma
chmod +x soma && sudo mv soma /usr/local/bin/
```

## Usage

Open Soma Search from the ribbon or command palette. If the vault is not yet part of its directory-local Soma workspace, initialize it from the sidebar. The plugin runs `soma init --no-color`, followed by `soma project add --exclude=.obsidian/** --no-color .`.

The first initialization also indexes the vault and may take a while when it contains many or large files. The sidebar can remain on `Initializing...` during this process; wait for it to complete before searching.

Choose a search mode:

- **Semantic** (`search.vector`) - finds related meaning and similar content
- **Keyword** (`search.lexical`) - matches exact words and phrases
- **Hybrid** (`search.hybrid`) - combines keyword and semantic relevance

Semantic search is the default. The result limit starts at 20 and can be set from 5 to 100. Both preferences are saved.

Search begins 450 ms after you stop typing, or immediately when you press `Enter`. Each result includes the file title, a preview, and a line number when available. Click a result, or focus it and press `Enter` or `Space`, to open it in a new tab. When Soma provides a matching line, Markdown files open directly at that location.

## Privacy and disclosures

- **Plugin network use:** The plugin communicates only with the local Soma instance over loopback HTTP at `127.0.0.1`; it does not upload vault content or search queries.
- **Plugin data and access:** The plugin runs the user-installed Soma executable and saves its configured path in Obsidian plugin data. It includes no telemetry, accounts, payments, or advertising.
- **Plugin storage:** Initialization creates `.soma/local.yml` and `.soma/local.sqlite` in the vault. These files contain Soma configuration and a plaintext search index, and are not removed when the plugin is disabled or uninstalled.
- **Soma:** The open-source Soma may download local models and helper programs from GitHub and Hugging Face, keep cache and log data outside the vault, and follow linked files outside the vault.

## Development

```bash
npm install
npm run build
npm run deploy -- "/path/to/vault"
```

After deployment, enable **Soma Search** under Obsidian's community plugins. Restart Obsidian after changing `manifest.json`; for source-only changes, rebuild and reload the plugin.

## Release

After updating and committing the version in `manifest.json`, `package.json`, and `versions.json`, create and push an annotated tag with the exact same version:

```bash
git tag -a 0.1.0 -m "0.1.0"
git push origin 0.1.0
```

The release workflow builds the plugin, attaches `main.js`, `manifest.json`, and `styles.css`, and creates a draft GitHub release. Review it, add release notes, then publish it manually.
