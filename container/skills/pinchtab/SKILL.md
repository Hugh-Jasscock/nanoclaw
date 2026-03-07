---
name: pinchtab
description: Control a real Chrome browser on the host machine with persistent login sessions. Use for web browsing, form filling, data extraction, screenshots, and any task requiring an authenticated browser. Pinchtab controls the user's actual Chrome with saved cookies/sessions — sites the user is logged into are already accessible.
allowed-tools: Bash(pinchtab:*)
---

# Browser Control with Pinchtab

Pinchtab controls a real Chrome browser on the host via HTTP. The user's logged-in sessions persist across uses.

## Setup

Set the server URL (required inside containers):

```bash
export PINCHTAB_URL=http://192.168.64.1:19867
```

## Quick start

```bash
pinchtab nav https://example.com       # Navigate to URL
pinchtab snap -i -c                    # Get interactive elements (compact)
pinchtab click e1                      # Click element by ref
pinchtab fill e2 "search query"        # Fill input field
pinchtab text                          # Extract readable text
```

## Core workflow

1. Navigate: `pinchtab nav <url>`
2. Snapshot: `pinchtab snap -i` (returns elements with refs like e0, e1, e2)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation

```bash
pinchtab nav <url>           # Navigate to URL
pinchtab tabs                # List open tabs
pinchtab tabs new <url>      # Open new tab
pinchtab tabs close <id>     # Close tab
```

### Snapshot (page analysis)

```bash
pinchtab snap                # Full accessibility tree
pinchtab snap -i             # Interactive elements only (recommended)
pinchtab snap -c             # Compact output (most token-efficient)
pinchtab snap -d             # Diff since last snapshot
pinchtab snap -i -c          # Interactive + compact (best for most tasks)
pinchtab snap -s "#main"     # Scope to CSS selector
pinchtab snap --tab <id>     # Snapshot specific tab
```

### Interactions (use refs from snapshot)

```bash
pinchtab click e1            # Click element
pinchtab fill e2 "text"      # Clear and type into input
pinchtab type e3 "text"      # Type without clearing
pinchtab press Enter         # Press key (Enter, Tab, Escape, etc.)
pinchtab hover e1            # Hover over element
pinchtab scroll e1           # Scroll to element
pinchtab scroll 500          # Scroll by pixels
pinchtab select e1 "value"   # Select dropdown option
pinchtab focus e1            # Focus element
```

### Extract content

```bash
pinchtab text                # Get readable page text
pinchtab text --raw          # Get raw text
pinchtab eval "document.title"  # Run JavaScript
```

### Screenshots & PDF

```bash
pinchtab ss                  # Screenshot (JPEG)
pinchtab ss -o page.png      # Save to file
pinchtab pdf --tab <id>      # Export as PDF
```

### Health check

```bash
pinchtab health              # Check server status
```

## Example: Research a topic

```bash
pinchtab nav https://news.ycombinator.com
pinchtab snap -i -c
pinchtab click e5            # Click an article link
pinchtab text                # Extract article text
```

## Example: Fill a form

```bash
pinchtab nav https://example.com/form
pinchtab snap -i
# Output: textbox "Email" [e1], textbox "Name" [e2], button "Submit" [e3]
pinchtab fill e1 "user@example.com"
pinchtab fill e2 "John Doe"
pinchtab click e3
pinchtab snap -i             # Check result
```

## Tips

- Always run `pinchtab snap -i -c` after navigating to see what's on the page
- Use `-c` (compact) flag to save tokens
- Use `-d` (diff) flag to see only what changed
- The browser has the user's real login sessions — no need to log in again
- If `pinchtab` is not found, install it: `npm install -g pinchtab`
