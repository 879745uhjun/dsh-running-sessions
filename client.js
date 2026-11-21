/**
 * dsh-running-sessions — browser half.
 *
 * A slim status bar in the conversation header that names every Session that
 * is working right now. The home screen (the blank New Session page) is a
 * waiting room: other Sessions keep running while you stand in it, and the
 * sidebar hides most of that. The bar keeps background work visible from any
 * page, without taking vertical space from the composer.
 *
 * It reads the Client Session Controller directly:
 *  - `sessions.list` is the live catalog; each row carries `running`, `blank`,
 *    `origin`, `updatedAt`, `cwd`, and the subagent catalog projection;
 *  - `uiSession.sessionStatus` adds the pending-interaction kind, so a Session
 *    blocked on your approval reads differently from one that is just busy.
 *
 * Nothing is persisted and no Host route is used: the Host already publishes
 * every fact this bar shows. Clicking a chip opens that Session through the
 * Workspace navigation service, exactly like a sidebar click.
 *
 * Visible copy comes from the Client locale service; styling uses theme tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-running-sessions',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = React

    const NS = 'running-sessions'
    /** Chips shown before the first measurement; a real browser replaces it. */
    const CHIP_FALLBACK = 3
    /** The bar never claims more than this share of the viewport, nor this many pixels. */
    const BAR_MAX_VW = 0.72
    const BAR_MAX_PX = 1200
    /** Width reserved for the count button plus the seams between bar children. */
    const COUNT_RESERVE = 170
    const BAR_SEAMS = 12
    /** Extra width the overflow button needs once not every chip fits. */
    const MORE_RESERVE = 72
    /** Space between two chips, matching the stylesheet. */
    const CHIP_GAP = 4
    /** Finished Sessions the popover will list; older ones stay in the sidebar. */
    const COMPLETED_LIMIT = 6
    /** Gap between the anchor and the popover, in CSS pixels. */
    const POPOVER_GAP = 8
    /** Widest popover; the viewport clamp keeps it on screen. */
    const POPOVER_WIDTH = 400

    /** Status key for each pending interaction a Session can be blocked on. */
    const PENDING_LABEL = {
      approval: 'status.approval',
      'plan-review': 'status.planReview',
      question: 'status.question',
    }

    const ZH = {
      aria: '正在进行的会话',
      'count.one': '{n} 个会话进行中',
      'count.other': '{n} 个会话进行中',
      'waiting.one': '{n} 个等你',
      'waiting.other': '{n} 个等你',
      'completed.one': '{n} 个刚刚完成',
      'completed.other': '{n} 个刚刚完成',
      current: '当前',
      more: '还有 {n} 个',
      open: '打开会话：{title}',
      'pop.title': '正在进行的会话',
      'pop.running': '正在进行的会话',
      'pop.completed': '刚刚完成',
      'pop.hidden.one': '还有 {n} 个会话',
      'pop.hidden.other': '还有 {n} 个会话',
      'status.running': '运行中',
      'status.completed': '刚刚完成',
      'status.approval': '等待你批准',
      'status.planReview': '等待确认计划',
      'status.question': '等待你的回答',
      'subagents.one': '{n} 个子任务',
      'subagents.other': '{n} 个子任务',
      'selftest.title': '自检',
      'selftest.run': '运行自检',
      'selftest.rerun': '重新运行',
      'selftest.copy': '复制结果',
      'selftest.copied': '已复制',
      'selftest.idle': '未运行',
      'selftest.running': '运行中',
      'selftest.pass': '通过',
      'selftest.fail': '失败',
      'selftest.skip': '跳过',
      'selftest.summary': '{pass} 通过 · {fail} 失败 · {skip} 跳过',
      'selftest.error': '自检无法运行：{error}',
      'selftest.item.catalog': '会话目录订阅',
      'selftest.item.mount': '状态条挂载点',
      'selftest.item.idle': '空闲不占位',
      'selftest.item.style': '样式规则已注入',
      'selftest.detail.catalog': 'sessions.list.subscribe 不可用',
      'selftest.detail.catalogOk': 'sessions.list.subscribe 可用',
      'selftest.detail.mount': 'conversation.header.leading 没有注册项',
      'selftest.detail.mountEntry': '槽位可用，但状态条条目不在其中',
      'selftest.detail.mountOk': '槽位已注册',
      'selftest.detail.idleBusy': '当前有 {n} 个会话运行中，无法验证空闲形态',
      'selftest.detail.idleAbsent': '无运行会话，且状态条容器不存在',
      'selftest.detail.idleCollapsed': '无运行会话，状态条高度为 0',
      'selftest.detail.idleVisible': '无运行会话，但状态条仍占 {height}px',
      'selftest.detail.style': '找不到 dsh-running-sessions 样式表',
      'selftest.detail.styleRule': '样式表存在，但没有 data-dsh-running-sessions 规则',
      'selftest.detail.styleOk': '{size} 字符的样式表已注入',
      'selftest.detail.timeout': '超过 2 秒未完成',
      'selftest.markdown.title': '## {plugin} 自检',
      'selftest.markdown.passLine': '- [x] {label} — 通过',
      'selftest.markdown.failLine': '- [ ] {label} — 失败：{detail}',
      'selftest.markdown.skipLine': '- [ ] {label} — 跳过：{detail}',
    }

    const EN = {
      aria: 'Sessions in progress',
      'count.one': '{n} session running',
      'count.other': '{n} sessions running',
      'waiting.one': '{n} waiting',
      'waiting.other': '{n} waiting',
      'completed.one': '{n} just finished',
      'completed.other': '{n} just finished',
      current: 'Current',
      more: '{n} more',
      open: 'Open session: {title}',
      'pop.title': 'Sessions in progress',
      'pop.running': 'Sessions in progress',
      'pop.completed': 'Just finished',
      'pop.hidden.one': '{n} more session',
      'pop.hidden.other': '{n} more sessions',
      'status.running': 'Running',
      'status.completed': 'Just finished',
      'status.approval': 'Waiting for your approval',
      'status.planReview': 'Waiting for plan review',
      'status.question': 'Waiting for your answer',
      'subagents.one': '{n} subagent',
      'subagents.other': '{n} subagents',
      'selftest.title': 'Self-test',
      'selftest.run': 'Run self-test',
      'selftest.rerun': 'Run again',
      'selftest.copy': 'Copy result',
      'selftest.copied': 'Copied',
      'selftest.idle': 'Not run',
      'selftest.running': 'Running',
      'selftest.pass': 'Pass',
      'selftest.fail': 'Fail',
      'selftest.skip': 'Skipped',
      'selftest.summary': '{pass} passed · {fail} failed · {skip} skipped',
      'selftest.error': 'Could not run the self-test: {error}',
      'selftest.item.catalog': 'Session catalog subscription',
      'selftest.item.mount': 'Status bar mount point',
      'selftest.item.idle': 'No placeholder when idle',
      'selftest.item.style': 'Stylesheet injected',
      'selftest.detail.catalog': 'sessions.list.subscribe is unavailable',
      'selftest.detail.catalogOk': 'sessions.list.subscribe is available',
      'selftest.detail.mount': 'conversation.header.leading has no registrations',
      'selftest.detail.mountEntry': 'the slot is available but the status bar entry is missing',
      'selftest.detail.mountOk': 'the slot is registered',
      'selftest.detail.idleBusy': '{n} sessions are running, so the idle form cannot be checked',
      'selftest.detail.idleAbsent': 'nothing is running and the bar container is absent',
      'selftest.detail.idleCollapsed': 'nothing is running and the bar height is 0',
      'selftest.detail.idleVisible': 'nothing is running but the bar still occupies {height}px',
      'selftest.detail.style': 'the dsh-running-sessions stylesheet is missing',
      'selftest.detail.styleRule': 'the stylesheet exists but has no data-dsh-running-sessions rule',
      'selftest.detail.styleOk': 'the injected stylesheet has {size} characters',
      'selftest.detail.timeout': 'timed out after 2s',
      'selftest.markdown.title': '## {plugin} self-test',
      'selftest.markdown.passLine': '- [x] {label} — pass',
      'selftest.markdown.failLine': '- [ ] {label} — fail: {detail}',
      'selftest.markdown.skipLine': '- [ ] {label} — skipped: {detail}',
    }

    /* ------------------------------------------------------------------ *
     * Pure derivation
     * ------------------------------------------------------------------ */

    /** Trailing path segment of a Windows or POSIX directory, without separators. */
    function basename(path) {
      if (typeof path !== 'string') return ''
      const trimmed = path.replace(/[\\/]+$/, '')
      if (trimmed === '') return ''
      const parts = trimmed.split(/[\\/]/)
      return parts[parts.length - 1] ?? ''
    }

    /** The durable title, then the display title, then the raw id. */
    function titleOf(row) {
      const title = typeof row.title === 'string' ? row.title.trim() : ''
      if (title !== '') return title
      const display = typeof row.displayTitle === 'string' ? row.displayTitle.trim() : ''
      if (display !== '') return display
      return row.id
    }

    /** The pending interaction kind the sidebar would show, if any. */
    function pendingOf(status) {
      const kind = status?.pendingInteraction?.kind
      return typeof kind === 'string' && PENDING_LABEL[kind] !== undefined ? kind : undefined
    }

    /** Count the direct children that are running, ignoring externally hosted ones. */
    function runningChildren(list, sessionId, statuses) {
      const catalog = list.projectionsBySession?.[sessionId]?.values?.subagentCatalog
      if (!Array.isArray(catalog)) return 0
      let count = 0
      for (const child of catalog) {
        if (child === null || typeof child !== 'object') continue
        if (child.mode === 'external') continue
        const status = statuses.get(child.id)
        const running = status?.running ?? list.byId[child.id]?.running
        if (running === true) count += 1
      }
      return count
    }

    /**
     * Project the Session catalog onto the status bar.
     *
     * Only top-level Sessions are listed: a subagent is a detail of its parent
     * row, not a separate destination. A blank Session is the New Session page
     * itself and can never be working, so it is excluded too.
     *
     * @param list - `sessions.list` snapshot.
     * @param statuses - `uiSession.sessionStatus` snapshot (id → facts).
     * @param labelOf - workspace label lookup for one Session id.
     * @param orderOf - stable first-seen rank per Session id, when known.
     * @returns rows: waiting-for-you first, then first-seen order, then activity.
     */
    function deriveRunning(list, statuses, labelOf, orderOf) {
      const rows = []
      for (const id of list.ids) {
        const row = list.byId[id]
        if (row === undefined || row.blank === true || row.origin === 'subagent') continue
        const status = statuses.get(id)
        if ((status?.running ?? row.running) !== true) continue
        const pending = pendingOf(status)
        rows.push({
          id,
          title: titleOf(row),
          workspace: labelOf(id, row),
          pending,
          current: (row.retainedBy?.mainView ?? 0) > 0,
          subagents: runningChildren(list, id, statuses),
          updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
        })
      }
      rows.sort((left, right) => {
        const leftWaiting = left.pending === undefined ? 0 : 1
        const rightWaiting = right.pending === undefined ? 0 : 1
        if (leftWaiting !== rightWaiting) return rightWaiting - leftWaiting
        const leftRank = orderOf?.(left.id)
        const rightRank = orderOf?.(right.id)
        if (leftRank !== undefined && rightRank !== undefined && leftRank !== rightRank) return leftRank - rightRank
        if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      })
      return rows
    }

    /**
     * Sessions that finished while the reader was looking elsewhere: the status
     * store keeps `completionUnread` until that Session becomes the main view.
     * Newest first, capped so a long absence cannot grow the popover without end.
     *
     * A Session opened from anywhere — the sidebar included — counts as read:
     * the projection records it in `visited` as soon as the main view retains
     * it, so the row disappears immediately and stays gone even if the
     * underlying unread flag lags behind. Running again clears the record.
     *
     * @param list - `sessions.list` snapshot.
     * @param statuses - `uiSession.sessionStatus` snapshot.
     * @param labelOf - workspace label lookup for one Session id.
     * @param visited - id set of finished Sessions already opened; mutated here.
     * @returns completed rows, newest first.
     */
    function deriveCompleted(list, statuses, labelOf, visited) {
      const rows = []
      for (const id of visited) if (list.byId[id] === undefined) visited.delete(id)
      for (const id of list.ids) {
        const row = list.byId[id]
        if (row === undefined || row.blank === true || row.origin === 'subagent') continue
        const status = statuses.get(id)
        if ((status?.running ?? row.running) === true) {
          visited.delete(id)
          continue
        }
        if (status?.completionUnread !== true) {
          visited.delete(id)
          continue
        }
        if ((row.retainedBy?.mainView ?? 0) > 0) {
          visited.add(id)
          continue
        }
        if (visited.has(id)) continue
        rows.push({
          id,
          title: titleOf(row),
          workspace: labelOf(id, row),
          updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
        })
      }
      rows.sort((left, right) => (right.updatedAt - left.updatedAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      return rows.length > COMPLETED_LIMIT ? rows.slice(0, COMPLETED_LIMIT) : rows
    }

    /** Whether two projections describe the same bar: ids, order, and rendered fields. */
    function sameRows(previous, next) {
      if (previous === next) return true
      if (previous === null || next === null || previous.length !== next.length) return false
      for (let index = 0; index < previous.length; index += 1) {
        const left = previous[index]
        const right = next[index]
        if (left.id !== right.id || left.title !== right.title || left.workspace !== right.workspace) return false
        if (left.pending !== right.pending || left.subagents !== right.subagents) return false
        if (left.current !== right.current) return false
      }
      return true
    }

    /** Whether the whole bar projection (running plus just-finished) is unchanged. */
    function sameSnapshot(previous, next) {
      if (previous === next) return true
      if (previous === null || next === null) return false
      return sameRows(previous.running, next.running) && sameRows(previous.completed, next.completed)
    }

    /** How many leading chips fit into `budget` after `reserve`, at `gap` between them. */
    function fitChipCount(widths, budget, gap = CHIP_GAP, reserve = 0) {
      const available = budget - reserve
      if (available <= 0) return 0
      let used = 0
      let fit = 0
      for (const width of widths) {
        const next = used + (fit === 0 ? 0 : gap) + width
        if (next > available) break
        used = next
        fit += 1
      }
      return fit
    }

    /**
     * Chips to render inline: as many as the bar's budget fits after the count
     * button, reserving the overflow button only when something is hidden. The
     * stylesheet's `max-width` and {@link BAR_MAX_VW}/{@link BAR_MAX_PX}
     * describe the same budget; keep them in step.
     */
    function visibleChipCount(widths, viewportWidth, countWidth = COUNT_RESERVE) {
      const budget = Math.min(viewportWidth * BAR_MAX_VW, BAR_MAX_PX)
      const available = Math.max(0, budget - countWidth - BAR_SEAMS)
      let fit = fitChipCount(widths, available, CHIP_GAP)
      if (fit < widths.length) fit = fitChipCount(widths, available, CHIP_GAP, MORE_RESERVE)
      return Math.max(0, Math.min(fit, widths.length))
    }

    /* ------------------------------------------------------------------ *
     * Live source
     * ------------------------------------------------------------------ */
    /**
     * One external store for the bar: recompute once per notification, keep the
     * previous array identity for React, and stay silent when the projection
     * means the same thing. A Session that only writes a durable event moves
     * `updatedAt` but not the bar, so it must not re-render the header.
     *
     * Running state itself is incremental. The catalog is rewritten on every
     * Session event, so one pass over `ids` is unavoidable — the store has no
     * delta channel — but the source keeps a `Map<id, boolean>` of the bar's
     * effective running bit and writes an entry only when that bit actually
     * changes. Everything expensive (title, workspace, subagent counts,
     * sorting) is then built for the running ids alone.
     *
     * The source also owns the chip order. Sorting by activity would make chips
     * jump every time any Session writes an event, so each running Session is
     * ranked when first observed and keeps that rank until it stops; a later
     * run starts at the back, and waiting Sessions still move to the front.
     *
     * @param list - Session catalog store.
     * @param statusStore - unified UI status store, when the service exists.
     * @param workspaceTitles - builds the id → Workspace title map once per pass.
     */
    function createRunningSource(list, statusStore, workspaceTitles) {
      const listeners = new Set()
      /** Bar-effective running bit per listed Session. */
      const runningStates = new Map()
      const rank = new Map()
      const visited = new Set()
      let sequence = 0
      let updates = 0
      let cache = null
      let disposed = false

      /**
       * Reconcile the index with one catalog snapshot.
       *
       * @param catalog - `sessions.list` snapshot.
       * @param statuses - unified status map.
       * @returns ids that are running now and ids that just finished unread.
       */
      const sync = (catalog, statuses) => {
        const seen = new Set()
        const runningIds = []
        const completedIds = []
        for (const id of catalog.ids) {
          const row = catalog.byId[id]
          if (row === undefined) continue
          seen.add(id)
          if (row.blank === true || row.origin === 'subagent') {
            if (runningStates.delete(id)) updates += 1
            rank.delete(id)
            continue
          }
          const status = statuses.get(id)
          const running = (status?.running ?? row.running) === true
          const known = runningStates.get(id)
          if (known !== running) {
            runningStates.set(id, running)
            updates += 1
          }
          if (running) {
            if (!rank.has(id)) rank.set(id, sequence++)
            runningIds.push(id)
            visited.delete(id)
            continue
          }
          rank.delete(id)
          if (status?.completionUnread !== true) {
            visited.delete(id)
            continue
          }
          if ((row.retainedBy?.mainView ?? 0) > 0) {
            visited.add(id)
            continue
          }
          if (visited.has(id)) continue
          completedIds.push(id)
        }
        for (const id of [...runningStates.keys()]) {
          if (seen.has(id)) continue
          runningStates.delete(id)
          rank.delete(id)
          updates += 1
        }
        for (const id of visited) if (catalog.byId[id] === undefined) visited.delete(id)
        return { runningIds, completedIds }
      }

      /** Build the rendered projection from the ids the index already selected. */
      const build = (catalog, statuses, labelOf, runningIds, completedIds) => {
        const running = runningIds.map((id) => {
          const row = catalog.byId[id]
          const status = statuses.get(id)
          return {
            id,
            title: titleOf(row),
            workspace: labelOf(id, row),
            pending: pendingOf(status),
            current: (row.retainedBy?.mainView ?? 0) > 0,
            subagents: runningChildren(catalog, id, statuses),
            updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
          }
        })
        running.sort((left, right) => {
          const leftWaiting = left.pending === undefined ? 0 : 1
          const rightWaiting = right.pending === undefined ? 0 : 1
          if (leftWaiting !== rightWaiting) return rightWaiting - leftWaiting
          const leftRank = rank.get(left.id)
          const rightRank = rank.get(right.id)
          if (leftRank !== undefined && rightRank !== undefined && leftRank !== rightRank) return leftRank - rightRank
          if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
        })
        const completed = completedIds.map((id) => {
          const row = catalog.byId[id]
          return {
            id,
            title: titleOf(row),
            workspace: labelOf(id, row),
            updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
          }
        })
        completed.sort((left, right) => (right.updatedAt - left.updatedAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
        return {
          running,
          completed: completed.length > COMPLETED_LIMIT ? completed.slice(0, COMPLETED_LIMIT) : completed,
        }
      }

      const compute = () => {
        const catalog = list.getSnapshot()
        const statuses = statusStore?.getSnapshot?.() ?? new Map()
        const { runningIds, completedIds } = sync(catalog, statuses)
        const labels = workspaceTitles()
        const labelOf = (sessionId, row) => labels.get(sessionId) ?? basename(row.cwd)
        return build(catalog, statuses, labelOf, runningIds, completedIds)
      }
      const invalidate = () => {
        if (disposed) return
        const next = compute()
        if (sameSnapshot(cache, next)) return
        cache = next
        for (const listener of listeners) listener()
      }
      const disposers = [list.subscribe(invalidate)]
      if (statusStore !== undefined && typeof statusStore.subscribe === 'function') {
        disposers.push(statusStore.subscribe(invalidate))
      }
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getSnapshot() {
          if (cache === null) cache = compute()
          return cache
        },
        /** Counter-shaped view for the parity tests: how many Map entries changed. */
        stats() {
          let running = 0
          for (const state of runningStates.values()) if (state) running += 1
          return { updates, tracked: runningStates.size, running }
        },
        /** First-seen rank for one id; test and debug aid. */
        rankOf(id) {
          return rank.get(id)
        },
        dispose() {
          disposed = true
          for (const dispose of disposers) dispose()
          disposers.length = 0
          listeners.clear()
          runningStates.clear()
          rank.clear()
          visited.clear()
        },
      }
    }
    /* ------------------------------------------------------------------ *
     * Presentation
     * ------------------------------------------------------------------ */

    const CSS = [
      // The bar owns its own row: the header becomes two rows while the bar is mounted,
      // so the status line and the conversation title never compete for width.
      'header:has([data-dsh-running-sessions]){grid-template-rows:auto auto;row-gap:4px}',
      'header:has([data-dsh-running-sessions])>[data-conversation-header-leading]{grid-column:1/-1;grid-row:1}',
      'header:has([data-dsh-running-sessions])>:nth-child(2){grid-column:1/-1;grid-row:2}',
      '.drs-bar{position:relative;display:flex;align-items:center;gap:4px;min-width:0;max-width:min(72vw, 1200px);padding-inline-start:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:22px}',
      '.drs-count{display:inline-flex;align-items:center;gap:7px;flex:none;height:24px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}',
      '.drs-count:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.drs-count:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color);outline-offset:-1px}',
      '.drs-count[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}',
      '.drs-beacon{flex:none;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-business-primary);position:relative}',
      '.drs-beacon::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--dsw-alias-state-business-primary);opacity:.35;animation:drs-ping 1.9s ease-out infinite}',
      '.drs-count[data-state=wait] .drs-beacon{background:var(--dsw-alias-state-warn-primary)}',
      '.drs-count[data-state=wait] .drs-beacon::after{border-color:var(--dsw-alias-state-warn-primary)}',
      '.drs-count[data-state=done] .drs-beacon{background:var(--dsw-alias-state-success-primary)}',
      '.drs-count[data-state=done] .drs-beacon::after{display:none}',
      '.drs-count-divider{flex:none;opacity:.45}',
      '.drs-waiting{flex:none;color:var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));font-weight:600}',
      '.drs-completed{flex:none;color:var(--dsw-alias-state-success-primary);font-weight:500}',
      '.drs-chevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform .15s ease}',
      '.drs-count[aria-expanded=true] .drs-chevron{transform:rotate(180deg)}',
      '.drs-chips{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}',
      '.drs-chip{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-width:0;max-width:180px;height:22px;padding:0 8px;border:0;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:22px;cursor:pointer}',
      '.drs-measure{position:absolute;left:0;top:0;display:flex;gap:4px;height:0;overflow:hidden;visibility:hidden;pointer-events:none}',
      '.drs-measure .drs-chip{flex:none}',
      '.drs-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.drs-chip:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color);outline-offset:1px}',
      '.drs-chip[data-waiting=true]{color:var(--dsw-alias-state-warn-label, var(--dsw-alias-label-primary))}',
      '.drs-chip[data-current=true]{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}',
      '.drs-tag{flex:none;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px}',
      '.drs-chip-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.drs-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}',
      '.drs-chip[data-waiting=true] .drs-dot,.drs-row[data-waiting=true] .drs-dot{background:var(--dsw-alias-state-warn-primary)}',
      '.drs-row[data-completed=true] .drs-dot{background:var(--dsw-alias-state-success-primary)}',
      '.drs-more{flex:none;height:22px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:22px;cursor:pointer;white-space:nowrap}',
      '.drs-more:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.drs-pop{position:fixed;z-index:1200;box-sizing:border-box;width:min(400px, calc(100vw - 24px));max-height:min(380px, calc(100vh - 96px));overflow-y:auto;overscroll-behavior:contain;padding:6px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu, var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-elevation-panel);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)}',
      '.drs-pop::-webkit-scrollbar{width:8px}',
      '.drs-pop::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border-radius:4px}',
      '.drs-pop-head{padding:4px 8px 6px;color:var(--dsw-alias-label-caption);font-size:11px;font-weight:600;letter-spacing:.02em}',
      '.drs-pop-head-gap{margin-top:6px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:9px}',
      '.drs-st{display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.drs-st-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.drs-st-title{font-weight:600}',
      '.drs-st-summary{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.drs-st-btn{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.drs-st-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.drs-st-btn.is-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}',
      '.drs-st-btn:disabled{opacity:.45;cursor:default}',
      '.drs-st-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}',
      '.drs-st-items{display:flex;flex-direction:column;gap:2px}',
      '.drs-st-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 0}',
      '.drs-st-label{flex:1;min-width:0;font-size:13px}',
      '.drs-st-badge{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.drs-st-badge.is-pass{color:var(--dsw-alias-state-success-primary)}',
      '.drs-st-badge.is-fail{color:var(--dsw-alias-state-error-primary)}',
      '.drs-st-badge.is-skip{color:var(--dsw-alias-state-warn-primary)}',
      '.drs-st-detail{flex-basis:100%;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.drs-list{list-style:none;margin:0;padding:0}',
      '.drs-row{appearance:none;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:9px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.drs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.drs-row:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color);outline-offset:-1px}',
      '.drs-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}',
      '.drs-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}',
      '.drs-meta{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:16px;white-space:nowrap}',
      '.drs-workspace{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.drs-sep{flex:none;opacity:.6}',
      '.drs-status{flex:none;overflow:hidden;text-overflow:ellipsis}',
      '.drs-status[data-waiting=true]{color:var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));font-weight:500}',
      '@keyframes drs-ping{0%{transform:scale(.55);opacity:.5}70%,100%{transform:scale(1.35);opacity:0}}',
      '@media (prefers-reduced-motion: reduce){.drs-beacon::after{animation:none;opacity:.28}.drs-chevron{transition:none}}',
      '@media (width<=900px){.drs-bar{max-width:min(40vw, 420px)}.drs-chips{display:none}}',
    ].join('')

    /** Downward chevron; flips while the popover is open. */
    function Chevron() {
      return h(
        'svg',
        { className: 'drs-chevron', viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true' },
        h('path', {
          d: 'M4 6.25 8 10.25 12 6.25',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** Localized status sentence for one row. */
    function statusText(row, t, completed = false) {
      if (completed) return t('status.completed')
      return t(row.pending === undefined ? 'status.running' : PENDING_LABEL[row.pending])
    }

    /** Hover text for a row: title, workspace, live status, and the current marker. */
    function rowHint(row, t, completed = false) {
      const parts = [row.title]
      if (row.workspace !== '') parts.push(row.workspace)
      parts.push(statusText(row, t, completed))
      if (row.current === true && !completed) parts.push(t('current'))
      if (row.subagents > 0) parts.push(t(row.subagents === 1 ? 'subagents.one' : 'subagents.other', { n: row.subagents }))
      return parts.join(' · ')
    }

    /** One inline chip: status dot plus the Session title. */
    function Chip({ row, t, onOpen }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'drs-chip',
          'data-waiting': row.pending === undefined ? undefined : 'true',
          'data-current': row.current ? 'true' : undefined,
          'aria-current': row.current ? 'true' : undefined,
          'aria-label': t('open', { title: row.title }),
          title: rowHint(row, t),
          onClick: () => onOpen(row.id),
        },
        h('span', { className: 'drs-dot', 'aria-hidden': 'true' }),
        h('span', { className: 'drs-chip-title' }, row.title),
      )
    }

    /** One popover row: dot, title, workspace plus status; `completed` swaps the marker. */
    function ListRow({ row, t, onOpen, completed = false }) {
      const waiting = !completed && row.pending !== undefined
      const current = !completed && row.current === true
      return h(
        'li',
        null,
        h(
          'button',
          {
            type: 'button',
            className: 'drs-row',
            'data-waiting': waiting ? 'true' : undefined,
            'data-completed': completed ? 'true' : undefined,
            'data-current': current ? 'true' : undefined,
            'aria-current': current ? 'true' : undefined,
            'aria-label': t('open', { title: row.title }),
            title: rowHint(row, t, completed),
            onClick: () => onOpen(row.id),
          },
          h('span', { className: 'drs-dot', 'aria-hidden': 'true' }),
          h(
            'span',
            { className: 'drs-main' },
            h('span', { className: 'drs-title' }, row.title),
            h(
              'span',
              { className: 'drs-meta' },
              row.workspace === ''
                ? null
                : [
                    h('span', { className: 'drs-workspace', key: 'workspace' }, row.workspace),
                    h('span', { className: 'drs-sep', key: 'sep', 'aria-hidden': 'true' }, '·'),
                  ],
              h('span', { className: 'drs-status', 'data-waiting': waiting ? 'true' : undefined }, statusText(row, t, completed)),
              current
                ? [
                    h('span', { className: 'drs-sep', key: 'current-sep', 'aria-hidden': 'true' }, '·'),
                    h('span', { className: 'drs-tag', key: 'current' }, t('current')),
                  ]
                : null,
              completed || row.subagents === 0
                ? null
                : [
                    h('span', { className: 'drs-sep', key: 'separator', 'aria-hidden': 'true' }, '·'),
                    h(
                      'span',
                      { key: 'subagents' },
                      t(row.subagents === 1 ? 'subagents.one' : 'subagents.other', { n: row.subagents }),
                    ),
                  ],
            ),
          ),
        ),
      )
    }

    /**
     * Place the popover under the control that opened it: left-aligned when it
     * fits, otherwise right-aligned so a trigger near the right edge keeps the
     * panel attached to it instead of jumping back to the bar's left edge.
     */
    function popoverLeft(triggerLeft, triggerRight, viewportWidth, width) {
      const margin = 12
      let left = triggerLeft
      if (left + width > viewportWidth - margin) left = triggerRight - width
      return Math.max(margin, Math.min(left, viewportWidth - width - margin))
    }

    /**
     * The header status bar. It renders nothing when no Session is working and
     * nothing finished unread, so an idle environment keeps the header untouched.
     *
     * @param props - slot props plus the shared source and the open callback.
     */
    function StatusBar({ t, source, onOpen }) {
      const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
      const running = snapshot.running
      const completed = snapshot.completed
      const [open, setOpen] = useState(false)
      /** `all` lists every running Session; `hidden` lists only the chips that did not fit. */
      const [mode, setMode] = useState('all')
      const [anchor, setAnchor] = useState(null)
      const [visibleCount, setVisibleCount] = useState(CHIP_FALLBACK)
      const [resizeTick, setResizeTick] = useState(0)
      const rootRef = useRef(null)
      const popRef = useRef(null)
      const measureRef = useRef(null)
      const countRef = useRef(null)
      const moreRef = useRef(null)
      const triggerRef = useRef(null)

      useEffect(() => {
        const bump = () => setResizeTick((value) => value + 1)
        window.addEventListener('resize', bump)
        return () => window.removeEventListener('resize', bump)
      }, [])

      useLayoutEffect(() => {
        const strip = measureRef.current
        if (strip === null) return
        const widths = Array.from(strip.children, (node) => node.getBoundingClientRect().width)
        // A hidden or scripted document reports zero widths; keep the fallback.
        if (widths.length === 0 || widths.every((width) => width === 0)) return
        const countWidth = countRef.current?.getBoundingClientRect().width
        setVisibleCount(visibleChipCount(widths, window.innerWidth, countWidth))
      }, [running, resizeTick])

      useEffect(() => {
        if (!open) return
        const place = () => {
          const bar = rootRef.current?.getBoundingClientRect()
          const raw = triggerRef.current?.getBoundingClientRect()
          // A trigger that unmounted between renders measures as a zero box; the bar is the fallback.
          const rect = raw !== undefined && (raw.width > 0 || raw.height > 0) ? raw : bar
          if (rect === undefined) return
          const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24)
          const left = popoverLeft(rect.left, rect.right, window.innerWidth, width)
          setAnchor({ left, top: rect.bottom + POPOVER_GAP, width })
        }
        place()
        window.addEventListener('resize', place)
        document.addEventListener('scroll', place, true)
        const dismiss = (event) => {
          const target = event.target
          if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          setOpen(false)
          rootRef.current?.querySelector('.drs-count')?.focus()
        }
        document.addEventListener('pointerdown', dismiss, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          window.removeEventListener('resize', place)
          document.removeEventListener('scroll', place, true)
          document.removeEventListener('pointerdown', dismiss, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      useEffect(() => {
        if (running.length === 0 && completed.length === 0) setOpen(false)
      }, [running.length, completed.length])

      if (running.length === 0 && completed.length === 0) return null

      const waiting = running.reduce((count, row) => count + (row.pending === undefined ? 0 : 1), 0)
      const visible = running.slice(0, Math.min(visibleCount, running.length))
      const hidden = running.length - visible.length
      const hiddenRows = running.slice(visible.length)
      // The overflow button lists exactly what it collapsed; the count lists everything.
      const showingHidden = mode === 'hidden' && hiddenRows.length > 0
      const popRows = showingHidden ? hiddenRows : running
      const popHead = showingHidden
        ? t(hiddenRows.length === 1 ? 'pop.hidden.one' : 'pop.hidden.other', { n: hiddenRows.length })
        : t('pop.running')
      const pick = (sessionId) => {
        setOpen(false)
        onOpen(sessionId)
      }
      const segments = []
      if (running.length > 0) {
        segments.push(h('span', { key: 'running' }, t(running.length === 1 ? 'count.one' : 'count.other', { n: running.length })))
      }
      if (waiting > 0) {
        segments.push(
          h('span', { className: 'drs-waiting', key: 'waiting' }, t(waiting === 1 ? 'waiting.one' : 'waiting.other', { n: waiting })),
        )
      }
      if (completed.length > 0) {
        segments.push(
          h(
            'span',
            { className: 'drs-completed', key: 'completed' },
            t(completed.length === 1 ? 'completed.one' : 'completed.other', { n: completed.length }),
          ),
        )
      }
      const beaconState = waiting > 0 ? 'wait' : running.length > 0 ? 'live' : 'done'

      return h(
        'div',
        { className: 'drs-bar', ref: rootRef, role: 'group', 'aria-label': t('aria'), 'data-dsh-running-sessions': '' },
        h(
          'button',
          {
            type: 'button',
            ref: countRef,
            className: 'drs-count',
            'data-state': beaconState,
            'aria-expanded': open ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            title: t('pop.title'),
            onClick: () => {
              triggerRef.current = countRef.current
              setMode('all')
              setOpen((value) => !value)
            },
          },
          h('span', { className: 'drs-beacon', 'aria-hidden': 'true' }),
          segments.flatMap((segment, index) =>
            index === 0
              ? [segment]
              : [
                  h('span', { className: 'drs-count-divider', key: `divider-${segment.key}`, 'aria-hidden': 'true' }, '·'),
                  segment,
                ],
          ),
          h(Chevron),
        ),
        visible.length === 0
          ? null
          : h(
              'div',
              { className: 'drs-chips' },
              visible.map((row) => h(Chip, { key: row.id, row, t, onOpen: pick })),
            ),
        hidden <= 0
          ? null
          : h(
              'button',
              {
                type: 'button',
                ref: moreRef,
                className: 'drs-more',
                'aria-label': t('more', { n: hidden }),
                title: t('more', { n: hidden }),
                onClick: () => {
                  triggerRef.current = moreRef.current
                  setMode('hidden')
                  setOpen(true)
                },
              },
              t('more', { n: hidden }),
            ),
        open && anchor !== null
          ? h(
              'div',
              {
                className: 'drs-pop',
                ref: popRef,
                role: 'dialog',
                'aria-label': t('pop.title'),
                style: { left: `${anchor.left}px`, top: `${anchor.top}px`, width: `${anchor.width}px` },
              },
              completed.length === 0 || showingHidden
                ? null
                : [
                    h('div', { className: 'drs-pop-head', key: 'completed-head' }, t('pop.completed')),
                    h(
                      'ul',
                      { className: 'drs-list', key: 'completed-list' },
                      completed.map((row) => h(ListRow, { key: row.id, row, t, onOpen: pick, completed: true })),
                    ),
                  ],
              popRows.length === 0
                ? null
                : [
                    h(
                      'div',
                      {
                        className:
                          completed.length === 0 || showingHidden ? 'drs-pop-head' : 'drs-pop-head drs-pop-head-gap',
                        key: 'running-head',
                      },
                      popHead,
                    ),
                    h(
                      'ul',
                      { className: 'drs-list', key: 'running-list' },
                      popRows.map((row) => h(ListRow, { key: row.id, row, t, onOpen: pick })),
                    ),
                  ],
            )
          : null,
        h(
          'div',
          { className: 'drs-measure', ref: measureRef, 'aria-hidden': 'true' },
          running.map((row) =>
            h(
              'span',
              { key: row.id, className: 'drs-chip' },
              h('span', { className: 'drs-dot' }),
              h('span', { className: 'drs-chip-title' }, row.title),
            ),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Self-test (plugins.detail.section)
     * ------------------------------------------------------------------ */

    const SELFTEST_TIMEOUT_MS = 2000

    function describeError(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /** Bundle and item subjects name the same plugin; accept both spellings. */
    function selfTestPluginName(subject) {
      if (subject?.kind === 'bundle') return subject?.pkg?.name
      if (subject?.kind === 'item') {
        return subject.id === 'dsh-running-sessions' || subject.id === 'include:dsh-running-sessions'
          ? 'dsh-running-sessions'
          : undefined
      }
      return undefined
    }

    function matchesSelfTestSubject(subject) {
      return selfTestPluginName(subject) === 'dsh-running-sessions'
    }

    function selfTestItems(t) {
      return [
        { id: 'catalog', label: t('selftest.item.catalog'), status: 'idle' },
        { id: 'mount', label: t('selftest.item.mount'), status: 'idle' },
        { id: 'idle', label: t('selftest.item.idle'), status: 'idle' },
        { id: 'style', label: t('selftest.item.style'), status: 'idle' },
      ]
    }

    function selfTestSummary(items) {
      const summary = { pass: 0, fail: 0, skip: 0 }
      for (const item of items) {
        if (item.status === 'pass') summary.pass += 1
        else if (item.status === 'skip') summary.skip += 1
        else if (item.status === 'fail') summary.fail += 1
      }
      return summary
    }

    function buildSelfTestMarkdown(items, t) {
      const summary = selfTestSummary(items)
      const lines = [
        t('selftest.markdown.title', { plugin: 'dsh-running-sessions' }),
        t('selftest.summary', { pass: String(summary.pass), fail: String(summary.fail), skip: String(summary.skip) }),
        '',
      ]
      for (const item of items) {
        if (item.status === 'pass') lines.push(t('selftest.markdown.passLine', { label: item.label }))
        else if (item.status === 'skip') lines.push(t('selftest.markdown.skipLine', { label: item.label, detail: item.detail ?? '' }))
        else lines.push(t('selftest.markdown.failLine', { label: item.label, detail: item.detail ?? '' }))
      }
      return lines.join('\n')
    }

    /** Run one check with a hard deadline; a timeout becomes a failed row. */
    function withSelfTestTimeout(run, timeoutMs, t) {
      return new Promise((resolve) => {
        let settled = false
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          try {
            controller?.abort()
          } catch {
            /* abort is best effort */
          }
          resolve({ status: 'fail', detail: t('selftest.detail.timeout') })
        }, timeoutMs)
        Promise.resolve()
          .then(() => run(controller?.signal))
          .then(
            (result) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve(result)
            },
            (error) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve({ status: 'fail', detail: describeError(error) })
            },
          )
      })
    }

    /** Running top-level Sessions, or undefined when the catalog is unreadable. */
    function runningSessionCount(ctx) {
      const snapshot = ctx.get('sessions')?.list?.getSnapshot?.()
      if (snapshot === undefined || !Array.isArray(snapshot.ids)) return undefined
      let count = 0
      for (const id of snapshot.ids) {
        const row = snapshot.byId?.[id]
        if (row === undefined || row.blank === true || row.origin === 'subagent') continue
        if (row.running === true) count += 1
      }
      return count
    }

    function selfTestStyleState() {
      const style = document.querySelector('style[data-plugin-css="dsh-running-sessions/RunningSessions.css"]')
      if (style === null) return { status: 'fail', detailKey: 'selftest.detail.style' }
      const text = typeof style.textContent === 'string' ? style.textContent : ''
      if (!text.includes('data-dsh-running-sessions')) return { status: 'fail', detailKey: 'selftest.detail.styleRule' }
      return { status: 'pass', detailKey: 'selftest.detail.styleOk', size: text.length }
    }

    /** Run the four read-only checks in parallel; each owns its own deadline. */
    async function runSelfTest(ctx, t, timeoutMs = SELFTEST_TIMEOUT_MS) {
      const checks = [
        {
          id: 'catalog',
          label: t('selftest.item.catalog'),
          run: () => {
            const list = ctx.get('sessions')?.list
            return typeof list?.subscribe === 'function'
              ? { status: 'pass', detail: t('selftest.detail.catalogOk') }
              : { status: 'fail', detail: t('selftest.detail.catalog') }
          },
        },
        {
          id: 'mount',
          label: t('selftest.item.mount'),
          run: () => {
            const entries = typeof ctx.slots?.entries === 'function' ? ctx.slots.entries('conversation.header.leading') : []
            if (!Array.isArray(entries) || entries.length === 0) return { status: 'fail', detail: t('selftest.detail.mount') }
            const mounted = entries.some((entry) => entry?.options?.id === 'running-sessions')
            return mounted
              ? { status: 'pass', detail: t('selftest.detail.mountOk') }
              : { status: 'fail', detail: t('selftest.detail.mountEntry') }
          },
        },
        {
          id: 'idle',
          label: t('selftest.item.idle'),
          run: () => {
            const count = runningSessionCount(ctx)
            if (count === undefined) return { status: 'fail', detail: t('selftest.detail.catalog') }
            if (count > 0) return { status: 'skip', detail: t('selftest.detail.idleBusy', { n: String(count) }) }
            const bar = document.querySelector('[data-dsh-running-sessions]')
            if (bar === null) return { status: 'pass', detail: t('selftest.detail.idleAbsent') }
            const rect = typeof bar.getBoundingClientRect === 'function' ? bar.getBoundingClientRect() : undefined
            const height = rect?.height ?? bar.offsetHeight ?? 0
            if (height === 0) return { status: 'pass', detail: t('selftest.detail.idleCollapsed') }
            return { status: 'fail', detail: t('selftest.detail.idleVisible', { height: String(Math.round(height)) }) }
          },
        },
        {
          id: 'style',
          label: t('selftest.item.style'),
          run: () => {
            const state = selfTestStyleState()
            if (state.status !== 'pass') return { status: state.status, detail: t(state.detailKey) }
            return { status: 'pass', detail: t(state.detailKey, { size: String(state.size) }) }
          },
        },
      ]
      const results = await Promise.all(checks.map((check) => withSelfTestTimeout(() => check.run(), timeoutMs, t)))
      const items = checks.map((check, index) => ({ id: check.id, label: check.label, ...results[index] }))
      return { items, summary: selfTestSummary(items), markdown: buildSelfTestMarkdown(items, t) }
    }

    /** Build the section component with the plugin context captured once. */
    function createSelfTestSection(ctx) {
      return function SelfTestSection({ subject, t }) {
        const [state, setState] = useState(() => ({
          running: false,
          items: selfTestItems(t),
          summary: null,
          error: null,
          copied: false,
          markdown: '',
        }))
        const copyTimer = useRef(0)
        useEffect(() => () => window.clearTimeout(copyTimer.current), [])

        if (!matchesSelfTestSubject(subject)) return null

        const summary = state.running
          ? t('selftest.running')
          : state.summary === null
            ? t('selftest.idle')
            : t('selftest.summary', {
                pass: String(state.summary.pass),
                fail: String(state.summary.fail),
                skip: String(state.summary.skip),
              })

        async function run() {
          setState({
            running: true,
            items: selfTestItems(t).map((item) => ({ ...item, status: 'running' })),
            summary: null,
            error: null,
            copied: false,
            markdown: '',
          })
          try {
            const result = await runSelfTest(ctx, t)
            setState({
              running: false,
              items: result.items,
              summary: result.summary,
              error: null,
              copied: false,
              markdown: result.markdown,
            })
          } catch (error) {
            const reason = describeError(error)
            setState({
              running: false,
              items: selfTestItems(t).map((item) => ({ ...item, status: 'fail', detail: reason })),
              summary: { pass: 0, fail: 4, skip: 0 },
              error: reason,
              copied: false,
              markdown: '',
            })
          }
        }

        async function copy() {
          if (state.markdown === '') return
          try {
            await navigator.clipboard.writeText(state.markdown)
            setState({ ...state, copied: true })
            window.clearTimeout(copyTimer.current)
            copyTimer.current = window.setTimeout(() => {
              setState((current) => ({ ...current, copied: false }))
            }, 1600)
          } catch {
            /* clipboard denied; the result stays on screen */
          }
        }

        return h(
          'section',
          { className: 'drs-st', 'data-plugin': 'dsh-running-sessions' },
          h(
            'div',
            { className: 'drs-st-head' },
            h('span', { className: 'drs-st-title' }, t('selftest.title')),
            h('span', { className: 'drs-st-summary', role: 'status' }, summary),
            h(
              'button',
              {
                type: 'button',
                className: 'drs-st-btn is-primary',
                disabled: state.running,
                onClick: () => {
                  void run()
                },
              },
              state.running ? t('selftest.running') : state.summary === null ? t('selftest.run') : t('selftest.rerun'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'drs-st-btn',
                disabled: state.markdown === '',
                onClick: () => {
                  void copy()
                },
              },
              state.copied ? t('selftest.copied') : t('selftest.copy'),
            ),
          ),
          state.error === null ? null : h('div', { className: 'drs-st-error' }, t('selftest.error', { error: state.error })),
          h(
            'div',
            { className: 'drs-st-items' },
            state.items.map((row) =>
              h(
                'div',
                { key: row.id, className: 'drs-st-row' },
                h('span', { className: 'drs-st-label' }, row.label),
                h('span', { className: `drs-st-badge is-${row.status}` }, t(`selftest.${row.status}`)),
                typeof row.detail === 'string' && row.detail !== ''
                  ? h('span', { className: 'drs-st-detail' }, row.detail)
                  : null,
              ),
            ),
          ),
        )
      }
    }


    /** Workspace titles by Session id, built in one pass per projection. */
    function createWorkspaceTitles(ctx) {
      return () => {
        const labels = new Map()
        const items = ctx.get('workspaces')?.list?.getSnapshot?.()?.items
        if (!Array.isArray(items)) return labels
        for (const item of items) {
          if (!Array.isArray(item.sessionIds)) continue
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          if (title === '') continue
          for (const sessionId of item.sessionIds) if (!labels.has(sessionId)) labels.set(sessionId, title)
        }
        return labels
      }
    }

    /* ------------------------------------------------------------------ *
     * Client plugin
     * ------------------------------------------------------------------ */

    const testApi = {
      deriveRunning,
      deriveCompleted,
      basename,
      titleOf,
      sameRows,
      sameSnapshot,
      fitChipCount,
      visibleChipCount,
      popoverLeft,
      createRunningSource,
      matchesSelfTestSubject,
      selfTestPluginName,
      selfTestItems,
      selfTestSummary,
      buildSelfTestMarkdown,
      withSelfTestTimeout,
      runSelfTest,
      CSS,
      ZH,
      EN,
    }
    if (typeof window !== 'undefined' && window.__DSH_RUNNING_SESSIONS_TEST__ === true) {
      window.__DSH_RUNNING_SESSIONS_TEST_API__ = testApi
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const sessions = ctx.get('sessions')
        if (sessions === undefined) throw new Error('running-sessions: the sessions service is unavailable')
        const uiSession = ctx.get('uiSession')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin-css', 'dsh-running-sessions/RunningSessions.css')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            style.remove()
          }
        }, 'running-sessions: styles')

        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              zh: ZH,
              en: EN,
              ja: EN,
              es: EN,
              fr: EN,
              de: EN,
              ru: EN,
              pt: EN,
            }),
          'running-sessions: dictionaries',
        )

        const source = createRunningSource(sessions.list, uiSession?.sessionStatus, createWorkspaceTitles(ctx))
        ctx.effect(() => () => source.dispose(), 'running-sessions: live source')

        const openSession = (sessionId) => {
          const navigation = ctx.get('uiWorkspace')
          if (navigation === undefined || typeof navigation.openSession !== 'function') return
          try {
            navigation.openSession(sessionId)
          } catch (error) {
            console.warn(`[running-sessions] could not open ${sessionId}:`, error)
          }
        }

        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register(
            {
              name: 'conversation.header.leading',
              id: 'running-sessions',
              locale: NS,
            },
            (props) => h(StatusBar, { ...props, source, onOpen: openSession }),
          ),
        )

        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            {
              name: 'plugins.detail.section',
              id: 'dsh-running-sessions.selftest',
              order: 90,
              locale: NS,
            },
            createSelfTestSection(ctx),
          ),
        )
      },
    }
  },
})
