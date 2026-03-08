---
name: kanban
description: Read and write to Jason's Kanban board. Use when managing tasks, priorities, ideas, or when Jason asks about his board, backlog, or what's in progress.
allowed-tools: Bash(kanban:*), Read, Write
---

# Kanban Board

Jason's task/idea board is stored at `/workspace/group/kanban.json`.

## Data format

```json
{
  "columns": ["Backlog", "In Progress", "In Review", "Done"],
  "wipLimit": 3,
  "categories": [
    "📱 App Development", "📈 Trading & Markets", "💼 Business Opportunities",
    "💰 Personal Finance", "🧠 Self Development", "🏠 Home & Family",
    "🔧 Woodrow Backlog", "💡 Random Pins"
  ],
  "cards": [
    {
      "id": "unique-id",
      "title": "Card title",
      "category": "📱 App Development",
      "priority": "high",
      "notes": "Optional details",
      "column": "Backlog",
      "created": "2026-03-07T00:00:00.000Z"
    }
  ]
}
```

## How to use

Read the board:
```bash
cat /workspace/group/kanban.json
```

To add, move, or update cards: read the JSON, modify the `cards` array, write it back. Always preserve existing cards when adding new ones.

### Add a card
Generate a unique ID with: `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`

### Move a card
Change the card's `column` field (e.g., from "Backlog" to "In Progress").

### Rules
- **WIP limit**: Keep "In Progress" to 3 items max
- **Priority**: `high`, `medium`, or `low`
- Always use an existing category from the categories list
- Jason views the board at http://localhost:9870 — changes you write to the JSON file appear there automatically
