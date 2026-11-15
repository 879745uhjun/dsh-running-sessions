# dsh-running-sessions

Every Session that is working right now, as one live status bar at the top of the DeepSeek Harness window.

## What it does

- **A status bar, not another card.** It registers one component in the Conversation header's
  leading seat. While it is mounted the header becomes two rows — the status line, then the
  session title and its controls — so the bar never competes with the title for width, and
  the composer keeps its vertical space.
- **Names, not just a number.** The bar reads `5 个会话进行中` and then shows the busiest
  Sessions as chips: one click opens that Session, exactly like a sidebar click. The chip
  count is measured, not fixed — the bar renders as many as its share of the header holds
  and re-measures on resize.
- **Waiting on you is visible at a glance.** A Session blocked on an approval, a plan review,
  or an answer keeps its amber dot and its status text, and sorts ahead of sessions that are
  simply busy. The count itself turns amber and appends the tally — `5 个会话进行中 · 2 个等你` —
  so the waiting fact survives even when the window is too narrow for chips. Subagent work is
  counted on the parent row instead of pretending to be a separate Session.
- **Finished work is not lost.** Sessions that stopped running and were not opened again are
  grouped under `刚刚完成` in the popover, with a green dot and a count segment in the bar.
  Opening one clears the reminder — from the popover, the sidebar, or anywhere else: the
  finished list records a Session as read as soon as the main view opens it, and navigating
  away again does not bring the row back. A later run makes it eligible once more. When
  nothing is running but something finished, the bar shows only that green tally.
- **The current Session is marked.** The Session you are reading carries a `当前` tag in the
  list and a subtle ring on its chip, so a bar full of similar titles stays unambiguous.
- **The full list is one click away.** More than the chips can hold collapses into
  `还有 N 个`; the count button opens a popover with every row — title, workspace, live status,
  running children, finished Sessions — placed under the control that opened it (right-aligned
  when that control sits near the right edge) and dismissed with Escape or an outside click.
- **Live, but quiet.** It subscribes to the Client Session catalog and the unified UI status
  store; the projection is compared by meaning, so a Session that only appends an event does
  not re-render the header. Starting, finishing, and switching to "waiting for you" update in
  place. Nothing polls.
- **Silent when idle.** No running Sessions and nothing finished unread means no bar and no
  reserved space.

## Where it lives

```
┌ conversation header ─────────────────────────────────────────────────────┐
│ ● 5 个会话进行中 · 2 个等你 ⌄  ● 会话 A  ● 会话 B  ● 会话 C  还有 2 个  │
│ 会话标题                                      标准模式      …    □      │
└──────────────────────────────────────────────────────────────────────────┘
```

The header's leading seat is the only always-mounted, root-scoped slot in the title row, so
the bar also appears on the blank New Session screen, where the session-specific header
chrome (title, mode, view tabs) is intentionally hidden. The plugin's stylesheet promotes
that seat to a full-width row whenever the bar is mounted, and drops back to the stock
single-row header as soon as the bar unmounts.

## Configuration

None. Install it and the bar appears whenever something is running.

## Implementation

| File | Role |
| --- | --- |
| `index.js` | Host half: declares the plugin entry; the feature itself needs no Host work. |
| `client.js` | Browser half: catalog projection, live store, header bar, popover, styles. |

The browser half reads three Client facts and nothing else:

- `sessions.list` — the live catalog. Each row carries `running`, `blank`, `origin`,
  `updatedAt`, `cwd`, `retainedBy.mainView` (the Session on screen), and the subagent catalog
  projection.
- `uiSession.sessionStatus` — `running`, the pending-interaction kind (`approval`,
  `plan-review`, `question`), and `completionUnread` for a Session that finished unopened.
- `workspaces.list` — used only to label rows with their Workspace title; the directory
  basename is the fallback.

`deriveRunning` filters out blank Sessions (the New Session page itself) and subagent rows,
puts waiting Sessions first, and ranks the rest by when they were first seen running so the
chips stay put while Sessions write events. `deriveCompleted` collects the unread finishes,
newest first, capped at six. Running children are counted through their parent's
`subagentCatalog`; the current Session is the row whose `retainedBy.mainView` is positive. A
single external store merges the two stores, compares each projection with the previous one by
meaning (running plus finished), and only then wakes React — an activity-only event keeps the
same array identity. Chip count is fitted from measured chip widths against
`min(72vw, 1200px)` minus the measured count button, reserving space for `还有 N 个` only when
something is hidden. The popover anchors to whichever control opened it, flipping to
right-alignment near the viewport edge. Opening a row goes through `ctx.uiWorkspace.openSession`,
the same navigation a sidebar click uses.

### Development

```bash
pnpm add -D jsdom react react-dom
node test/client.dom.test.mjs
```

The DOM harness runs the shipped `client.js` in jsdom against a stubbed module loader,
catalog, and status store. It covers ordering, filtering, chips, overflow, the waiting
summary, the current marker, the just-finished section, the popover, popover anchoring,
Escape and outside-click dismissal, opening a Session, live updates, subagent counts,
chip-width fitting, notification suppression, and the idle state.

## License

MIT.
