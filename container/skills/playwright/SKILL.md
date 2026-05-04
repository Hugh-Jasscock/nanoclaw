---
name: playwright
description: Control a headless Chromium browser inside the container for web browsing, form filling, data extraction, screenshots, and testing. Uses Playwright MCP tools (not Bash commands). Each agent gets an isolated browser context by default.
allowed-tools: mcp__playwright__*
---

# Browser Automation with Playwright MCP

All browser tools are MCP tools — call them directly, not via Bash.

## Core Workflow

1. **Navigate**: `mcp__playwright__browser_navigate` with `{ url: "https://..." }`
2. **Snapshot**: `mcp__playwright__browser_snapshot` — returns accessibility tree with element refs
3. **Interact**: Use refs from the snapshot to click, type, hover, etc.
4. **Re-snapshot**: After navigation or DOM changes, snapshot again to get fresh refs

## Tool Reference

### Navigation

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_navigate` | `{ url }` | Go to a URL |
| `browser_go_back` | `{}` | Navigate back |
| `browser_go_forward` | `{}` | Navigate forward |
| `browser_tab_list` | `{}` | List open tabs |
| `browser_tab_new` | `{ url? }` | Open new tab |
| `browser_tab_close` | `{ tabId }` | Close a tab |
| `browser_close` | `{}` | Close the browser |

### Page Analysis

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_snapshot` | `{}` | Accessibility tree with element refs (most useful) |
| `browser_screenshot` | `{ raw? }` | Take a screenshot (returns base64 image) |
| `browser_pdf_save` | `{ filename }` | Save page as PDF |

### Interactions (use refs from snapshot)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_click` | `{ element, ref }` | Click an element |
| `browser_type` | `{ element, ref, text, submit? }` | Type into an input |
| `browser_hover` | `{ element, ref }` | Hover over element |
| `browser_select_option` | `{ element, ref, values }` | Select dropdown option |
| `browser_press_key` | `{ key }` | Press a keyboard key |
| `browser_drag` | `{ startElement, startRef, endElement, endRef }` | Drag and drop |
| `browser_file_upload` | `{ paths }` | Upload files to input |

### Viewport & Device Emulation

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_resize` | `{ width, height }` | Resize viewport |

Common presets:
- **Mobile (iPhone)**: `{ width: 375, height: 812 }`
- **Tablet (iPad)**: `{ width: 768, height: 1024 }`
- **Desktop**: `{ width: 1280, height: 800 }`

### Dialog Handling

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_handle_dialog` | `{ accept, promptText? }` | Handle alert/confirm/prompt |

## Migration from Pinchtab / agent-browser

| Old (Pinchtab/agent-browser) | New (Playwright MCP) |
|------|------|
| `pinchtab nav <url>` | `browser_navigate { url: "..." }` |
| `pinchtab snap -i -c` | `browser_snapshot {}` |
| `pinchtab click e1` | `browser_click { element: "description", ref: "e1" }` |
| `pinchtab fill e2 "text"` | `browser_type { element: "description", ref: "e2", text: "..." }` |
| `pinchtab ss -o file.png` | `browser_screenshot {}` |
| `pinchtab eval "js"` | Use Bash: `node -e "..."` for JS evaluation |
| `agent-browser open <url>` | `browser_navigate { url: "..." }` |
| `agent-browser snapshot -i` | `browser_snapshot {}` |
| `agent-browser click @e1` | `browser_click { element: "description", ref: "e1" }` |

## Key Differences from Pinchtab

- **MCP tools, not CLI**: Call tools directly — no Bash, no text parsing
- **Isolated by default**: Each agent gets its own browser instance. No shared state.
- **In-container**: Runs headless Chromium inside the container. No host-side service needed.
- **No saved logins**: Since the browser is fresh each time, you must authenticate within the session if needed.

## Example: Research a Website

```
1. browser_navigate { url: "https://dribbble.com/search/glassmorphism" }
2. browser_snapshot {}                    → get element refs
3. browser_screenshot {}                  → capture visual reference
4. browser_click { element: "First shot", ref: "e5" }
5. browser_snapshot {}                    → get detail page content
```

## Example: Device Emulation Testing

```
1. browser_navigate { url: "http://localhost:3000" }
2. browser_resize { width: 375, height: 812 }    → iPhone viewport
3. browser_screenshot {}                           → mobile screenshot
4. browser_resize { width: 1280, height: 800 }   → desktop viewport
5. browser_screenshot {}                           → desktop screenshot
```

## Tips

- Always `browser_snapshot` before interacting — refs change after navigation
- Use `browser_screenshot` when you need visual verification (layout, colors, spacing)
- Use `browser_snapshot` when you need structural info (text content, element tree, accessibility)
- For long pages, scroll by clicking anchor links or using `browser_press_key { key: "PageDown" }`
