# 📋 Repo to Prompt

Paste a GitHub repo URL → browse the file tree → select files → get a single copyable prompt with all file contents aggregated.

## Features

- **🔗 GitHub repo URL input** — paste any `https://github.com/owner/repo` URL
- **🌿 Branch selector** — switch branches after loading
- **📁 Interactive file tree** — collapsible folders, checkboxes, file sizes
- **🔍 Search/filter** — quick-filter file names
- **📋 One-click copy** — aggregated text with file path headers, ready to paste into an LLM
- **📊 Stats** — character count, ~token estimate, file count
- **⚙️ Settings** — optional GitHub token (for private repos & higher rate limits), customizable ignore patterns, max file size
- **🌙 Dark mode**
- **📱 Responsive**

## Usage

Visit: **https://antgro.github.io/repo-to-prompt/**

Or open `index.html` locally.

### Optional: GitHub Token

For private repos or higher API rate limits (60/hr → 5,000/hr), add a GitHub Personal Access Token in Settings (⚙️). Stored in localStorage only.

### URL Parameter

Direct link with pre-loaded repo: `?repo=owner/repo`

## Built-in Ignore Patterns

`node_modules/`, `.git/`, `__pycache__/`, `dist/`, `.env*`, `package-lock.json`, binary files, etc. Fully customizable in Settings.

---

*Fait avec 🪶 par De l'Hatch-Claw*
