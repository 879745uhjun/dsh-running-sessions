// DOM harness for the running-sessions status bar.
//
// Runs the shipped client bundle inside jsdom with a stubbed module loader, a
// stubbed Client Session catalog, and a stubbed unified status store, then
// drives the real React bar: count, chips, overflow, the popover list, opening
// a Session, live updates, and the idle state where the bar must disappear.
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

// React's DOM renderer reads `window`/`document` globals, so install jsdom
// before importing it.
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'http://127.0.0.1:56696/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')

/** Wait until `probe` returns a truthy value or the deadline passes. */
async function waitFor(probe, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** A small snapshot store shaped like the Client's `createSnapshotStore`. */
function createStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set(next) {
      snapshot = next
      for (const listener of listeners) listener()
    },
  }
}

/** Build one catalog row the way `ClientSessions.projectList` does. */
function row(id, extra = {}) {
  return {
    id,
    displayTitle: extra.title ?? id,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 1_000,
    ...extra,
  }
}

/** Catalog snapshot from rows. */
function catalog(rows, projections = {}) {
  return {
    ids: rows.map((entry) => entry.id),
    byId: Object.fromEntries(rows.map((entry) => [entry.id, entry])),
    phase: 'ready',
    projectionsBySession: projections,
  }
}

/** Minimal locale table renderer matching the Client's `{name}` interpolation. */
function translator(dict) {
  return (key, params) => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
}

/** Load the client bundle with stubs; return the bar registration and stores. */
function loadPlugin(options = {}) {
  const opened = []
  const registrations = []
  const dicts = {}
  const effects = []
  const sessions = createStore(options.catalog ?? catalog([]))
  const statuses = createStore(options.statuses ?? new Map())
  const workspaces = createStore(options.workspaces ?? { phase: 'ready', items: [], pinnedSessionIds: [], archivedSessionIds: [] })
  const container = document.createElement('div')
  document.body.appendChild(container)

  const ctx = {
    effect(fn, label) {
      const dispose = fn()
      effects.push({ label, dispose })
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(_ns, table) {
        Object.assign(dicts, table)
      },
      bind: () => translator(dicts.zh ?? {}),
    },
    slots: {
      inject(_name, fn) {
        fn()
      },
      register(entry, component) {
        registrations.push({ entry, component })
        return () => {}
      },
      entries(name) {
        return registrations.filter((row) => row.entry.name === name).map((row) => ({ options: row.entry }))
      },
    },
    get(name) {
      if (name === 'sessions') return { list: sessions }
      if (name === 'uiSession') return { sessionStatus: statuses }
      if (name === 'workspaces') return { list: workspaces }
      if (name === 'uiWorkspace') return { openSession: (id) => opened.push(id) }
      if (name === 'locale') return ctx.locale
      return undefined
    },
  }

  window.__DSH_RUNNING_SESSIONS_TEST__ = true
  window.__ModuleLoader__ = {
    load(def) {
      const api = def.factory((id) => {
        if (id === 'react') return React
        throw new Error(`unexpected require: ${id}`)
      })
      api.apply(ctx)
    },
  }
  window.eval(SOURCE)
  return { container, opened, registrations, ctx, sessions, statuses, workspaces, dicts, effects }
}

/** Mount the registered bar into its container. */
function mount(build) {
  const registration = build.registrations.find((entry) => entry.entry.name === 'conversation.header.leading')
  if (registration === undefined) throw new Error('bar was not registered')
  const t = translator(build.dicts.zh ?? {})
  const root = createRoot(build.container)
  root.render(React.createElement(registration.component, { t }))
  return {
    container: build.container,
    bar: () => build.container.querySelector('.drs-bar'),
    chips: () => Array.from(build.container.querySelectorAll('.drs-chips .drs-chip')),
    measured: () => build.container.querySelectorAll('.drs-measure .drs-chip').length,
    pop: () => build.container.querySelector('.drs-pop'),
    text: () => build.container.textContent,
    unmount: () => root.unmount(),
  }
}

let failures = 0
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`✔ ${label}`)
    return
  }
  failures += 1
  console.error(`✖ ${label}${detail ? ` — ${detail}` : ''}`)
}

const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

// ---------------------------------------------------------------------------
// Happy path: five running Sessions, one waiting on the user
// ---------------------------------------------------------------------------

const build = loadPlugin({
  catalog: catalog([
    row('blank-1', { blank: true, running: true, updatedAt: 9_000 }),
    row('idle-1', { title: 'Idle 会话', updatedAt: 8_000 }),
    row('run-old', { title: 'Old 会话', running: true, updatedAt: 1_000, cwd: 'D:\\Work\\alpha' }),
    row('run-new', { title: 'New 会话', running: true, updatedAt: 5_000, retainedBy: { mainView: 1 }, cwd: 'D:\\Work\\beta' }),
    row('run-mid', { title: 'Mid 会话', running: true, updatedAt: 4_000, cwd: 'D:\\Work\\gamma' }),
    row('run-low', { title: 'Low 会话', running: true, updatedAt: 3_000, cwd: 'D:\\Work\\delta' }),
    row('run-last', { title: 'Last 会话', running: true, updatedAt: 2_000, cwd: 'D:\\Work\\epsilon' }),
    row('done-1', { title: 'Done 会话', updatedAt: 6_000, cwd: 'D:/Work/zeta' }),
    row('child-1', { title: 'Child 会话', running: true, origin: 'subagent', parentId: 'run-new' }),
  ]),
  statuses: new Map([
    ['run-old', { running: true, pendingInteraction: { kind: 'approval' } }],
    ['run-new', { running: true }],
    ['done-1', { running: false, completionUnread: true }],
    ['idle-1', { running: false }],
  ]),
  workspaces: {
    phase: 'ready',
    items: [{ workspaceId: 'w1', title: '俄语', path: 'D:\\Work\\alpha', sessionIds: ['run-old'] }],
    pinnedSessionIds: [],
    archivedSessionIds: [],
  },
})

const page = mount(build)
await waitFor(() => page.chips().length > 0, 'chips')

check('registers one header-leading entry', build.registrations.filter((entry) => entry.entry.name === 'conversation.header.leading').length === 1)
check('entry carries an id and locale', build.registrations[0].entry.id === 'running-sessions' && build.registrations[0].entry.locale === 'running-sessions')
check('installs the stylesheet once', document.querySelectorAll('style[data-plugin-css="dsh-running-sessions/RunningSessions.css"]').length === 1)
check(
  'two-row header layout is scoped to the mounted bar',
  (document.querySelector('style[data-plugin-css="dsh-running-sessions/RunningSessions.css"]')?.textContent ?? '').includes(
    'header:has([data-dsh-running-sessions])',
  ),
)
check('count covers every running Session', page.container.querySelector('.drs-count')?.textContent.includes('5 个会话进行中'), page.container.querySelector('.drs-count')?.textContent ?? '')
check('count flags the waiting Session', page.container.querySelector('.drs-count')?.getAttribute('data-state') === 'wait')
check('count spells out who is waiting', page.container.querySelector('.drs-waiting')?.textContent === '1 个等你', page.container.querySelector('.drs-waiting')?.textContent ?? '')
check('count mentions the finished Session', page.container.querySelector('.drs-completed')?.textContent === '1 个刚刚完成', page.container.querySelector('.drs-completed')?.textContent ?? '')
check('measurement strip covers every running Session', page.measured() === 5, String(page.measured()))
check('skips blank, idle, and subagent Sessions', page.text().includes('5 个会话进行中') && !page.text().includes('Child 会话'))
check('shows at most three chips', page.chips().length === 3, String(page.chips().length))
check('waiting Session leads the chips', page.chips()[0].textContent.includes('Old 会话'))
check('waiting chip is flagged', page.chips()[0].getAttribute('data-waiting') === 'true')
check('running chip is not flagged', page.chips()[1].getAttribute('data-waiting') === null)
check('current Session chip is marked', page.chips()[1].getAttribute('data-current') === 'true' && page.chips()[1].getAttribute('aria-current') === 'true')
check('current marker reaches the tooltip', (page.chips()[1].getAttribute('title') ?? '').includes('当前'), page.chips()[1].getAttribute('title') ?? '')
check('overflow reports the remainder', page.container.querySelector('.drs-more')?.textContent === '还有 2 个')
check('chip tooltip carries status', (page.chips()[0].getAttribute('title') ?? '').includes('等待你批准'), page.chips()[0].getAttribute('title') ?? '')
check('no popover until asked', page.pop() === null)

// A chip opens its Session directly.
click(page.chips()[1])
await waitFor(() => build.opened.length === 1, 'chip open')
check('chip opens the Session', build.opened[0] === 'run-new', String(build.opened[0]))

// The count opens the full list.
click(page.container.querySelector('.drs-count'))
await waitFor(() => page.pop() !== null, 'popover')
check('popover lists every running Session', page.container.querySelectorAll('.drs-pop .drs-row').length === 6, String(page.container.querySelectorAll('.drs-pop .drs-row').length))
check('finished section leads the popover', page.container.querySelectorAll('.drs-pop .drs-row')[0].getAttribute('data-completed') === 'true' && page.container.querySelectorAll('.drs-pop .drs-row')[0].textContent.includes('Done 会话'))
check('popover keeps the waiting first among running rows', page.container.querySelectorAll('.drs-pop .drs-row')[1].textContent.includes('Old 会话'))
check('popover shows the workspace title', page.container.querySelector('.drs-pop')?.textContent.includes('俄语'))
check('popover shows the directory fallback', page.container.querySelector('.drs-pop')?.textContent.includes('beta'))
check('popover shows the running label', page.container.querySelector('.drs-pop')?.textContent.includes('运行中'))
check('popover heads the finished section first', page.container.querySelector('.drs-pop-head')?.textContent === '刚刚完成')
check('count reports the expanded state', page.container.querySelector('.drs-count')?.getAttribute('aria-expanded') === 'true')
check('popover separates the finished section', page.container.querySelectorAll('.drs-pop-head').length === 2 && page.container.querySelectorAll('.drs-pop-head')[1].textContent === '正在进行的会话')
check('popover marks the finished row', page.container.querySelector('.drs-pop .drs-row[data-completed=true]')?.textContent.includes('Done 会话'))
check('popover tags the current Session', page.container.querySelector('.drs-pop .drs-tag')?.textContent === '当前')

// A row opens its Session and closes the popover.
const rows = page.container.querySelectorAll('.drs-pop .drs-row')
click(rows[2])
await waitFor(() => build.opened.length === 2, 'popover open')
check('popover row opens the Session', build.opened[1] === 'run-new', String(build.opened[1]))
await waitFor(() => page.pop() === null, 'popover closes')
check('opening a Session closes the popover', page.pop() === null)

// Escape closes an open popover.
click(page.container.querySelector('.drs-count'))
await waitFor(() => page.pop() !== null, 'popover reopens')
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await waitFor(() => page.pop() === null, 'popover dismissed')
check('Escape dismisses the popover', page.pop() === null)

// Outside pointerdown closes it too.
click(page.container.querySelector('.drs-count'))
await waitFor(() => page.pop() !== null, 'popover third open')
document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
await waitFor(() => page.pop() === null, 'popover dismissed by outside pointerdown')
check('outside pointerdown dismisses the popover', page.pop() === null)

// A finished row is a destination too.
click(page.container.querySelector('.drs-count'))
await waitFor(() => page.pop() !== null, 'popover for finished row')
click(page.container.querySelector('.drs-pop .drs-row[data-completed=true]'))
await waitFor(() => build.opened.length === 3, 'finished open')
check('finished row opens the Session', build.opened[2] === 'done-1', String(build.opened[2]))
await waitFor(() => page.pop() === null, 'popover closes after finished open')

// The overflow button lists only what it collapsed.
click(page.container.querySelector('.drs-more'))
await waitFor(() => page.pop() !== null, 'hidden popover')
check('overflow popover lists only hidden Sessions', page.container.querySelectorAll('.drs-pop .drs-row').length === 2, String(page.container.querySelectorAll('.drs-pop .drs-row').length))
check('overflow popover names what it hid', page.container.querySelector('.drs-pop-head')?.textContent === '还有 2 个会话', page.container.querySelector('.drs-pop-head')?.textContent ?? '')
check('overflow popover drops the finished section', page.container.querySelectorAll('.drs-pop-head').length === 1)
const hiddenRows = page.container.querySelectorAll('.drs-pop .drs-row')
check('overflow popover lists the collapsed Sessions', hiddenRows[0].textContent.includes('Low 会话') && hiddenRows[1].textContent.includes('Last 会话'))
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await waitFor(() => page.pop() === null, 'hidden popover closed')

// The count still opens the complete picture.
click(page.container.querySelector('.drs-count'))
await waitFor(() => page.pop() !== null, 'full popover after hidden')
check('count still lists every Session', page.container.querySelectorAll('.drs-pop .drs-row').length === 6)
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
await waitFor(() => page.pop() === null, 'full popover closed')

// The bar is live: a Session that stops running leaves the count.
build.sessions.set(
  catalog([
    row('run-old', { title: 'Old 会话', running: false, updatedAt: 1_000 }),
    row('run-new', { title: 'New 会话', running: true, updatedAt: 5_000 }),
  ]),
)
build.statuses.set(new Map())
await waitFor(() => page.text().includes('1 个会话进行中'), 'live count')
check('live update recounts the bar', page.text().includes('1 个会话进行中'), page.text())
check('finished waiting session clears the segment', page.container.querySelector('.drs-waiting') === null && page.container.querySelector('.drs-count')?.getAttribute('data-state') === 'live')
check('single Session drops the overflow button', page.container.querySelector('.drs-more') === null)

build.sessions.set(catalog([row('run-new', { title: 'New 会话', running: false })]))
await waitFor(() => page.bar() === null, 'bar hidden when idle')
check('bar disappears when nothing runs', page.bar() === null)
// Idle leaves no element at all — no placeholder, and the scoped `:has()` header rule
// can no longer match, so the header returns to its stock single-row layout.
check('idle leaves no placeholder behind', page.container.childNodes.length === 0, String(page.container.childNodes.length))

// ---------------------------------------------------------------------------
// Nothing running, but something finished while you were away
// ---------------------------------------------------------------------------

const finishedBuild = loadPlugin({
  catalog: catalog([
    row('done-a', { title: 'Finished A', updatedAt: 1_000, cwd: 'D:/Work/one' }),
    row('done-b', { title: 'Finished B', updatedAt: 2_000, cwd: 'D:/Work/two' }),
  ]),
  statuses: new Map([
    ['done-a', { running: false, completionUnread: true }],
    ['done-b', { running: false, completionUnread: true }],
  ]),
})
const finishedPage = mount(finishedBuild)
await waitFor(() => finishedPage.bar() !== null, 'finished bar')
check('finished-only bar appears', finishedPage.bar() !== null)
check('finished-only count skips the zero running figure', finishedPage.container.querySelector('.drs-count')?.textContent.startsWith('2 个刚刚完成'), finishedPage.container.querySelector('.drs-count')?.textContent ?? '')
check('finished-only beacon is green', finishedPage.container.querySelector('.drs-count')?.getAttribute('data-state') === 'done')
check('finished-only bar shows no chips', finishedPage.chips().length === 0)
click(finishedPage.container.querySelector('.drs-count'))
await waitFor(() => finishedPage.pop() !== null, 'finished popover')
check('finished-only popover has no running section', finishedPage.container.querySelectorAll('.drs-pop-head').length === 1 && finishedPage.container.querySelectorAll('.drs-pop-head')[0].textContent === '刚刚完成')
check('finished list is newest first', finishedPage.container.querySelectorAll('.drs-pop .drs-row')[0].textContent.includes('Finished B'))
finishedPage.unmount()

// ---------------------------------------------------------------------------
// Opening a finished Session from the sidebar clears the reminder
// ---------------------------------------------------------------------------

const visitBuild = loadPlugin({
  catalog: catalog([row('done-v', { title: 'Visited 会话', updatedAt: 5 })]),
  statuses: new Map([['done-v', { running: false, completionUnread: true }]]),
})
const visitPage = mount(visitBuild)
await waitFor(() => visitPage.bar() !== null, 'finished bar before visit')
check('finished row appears before the visit', visitPage.text().includes('1 个刚刚完成'))

visitBuild.sessions.set(catalog([row('done-v', { title: 'Visited 会话', updatedAt: 5, retainedBy: { mainView: 1 } })]))
await waitFor(() => visitPage.bar() === null, 'bar hides after visit')
check('opening from the sidebar clears the reminder', visitPage.bar() === null)

visitBuild.sessions.set(catalog([row('done-v', { title: 'Visited 会话', updatedAt: 5 })]))
await new Promise((resolve) => setTimeout(resolve, 60))
check('navigating away does not restore the reminder', visitPage.bar() === null)

visitBuild.sessions.set(catalog([row('done-v', { title: 'Visited 会话', running: true, updatedAt: 6 })]))
visitBuild.statuses.set(new Map([['done-v', { running: true }]]))
await waitFor(() => visitPage.bar() !== null, 'running again')
visitBuild.sessions.set(catalog([row('done-v', { title: 'Visited 会话', running: false, updatedAt: 7 })]))
visitBuild.statuses.set(new Map([['done-v', { running: false, completionUnread: true }]]))
await waitFor(() => visitPage.text().includes('1 个刚刚完成'), 'finished again')
check('a later run is reported again', visitPage.text().includes('1 个刚刚完成'))
visitPage.unmount()

// ---------------------------------------------------------------------------
// Subagent detail and workspace fallback
// ---------------------------------------------------------------------------

const subagentBuild = loadPlugin({
  catalog: catalog(
    [row('run-parent', { title: 'Parent 会话', running: true })],
    {
      'run-parent': {
        values: {
          subagentCatalog: [
            { id: 'kid-1', mode: 'continuable', label: 'kid one' },
            { id: 'kid-2', mode: 'continuable', label: 'kid two' },
            { id: 'ext-1', mode: 'external', label: 'outside' },
          ],
        },
      },
    },
  ),
  statuses: new Map([
    ['kid-1', { running: true }],
    ['kid-2', { running: false }],
    ['ext-1', { running: true }],
  ]),
})
const subagentPage = mount(subagentBuild)
await waitFor(() => subagentPage.chips().length === 1, 'single chip')
click(subagentPage.container.querySelector('.drs-count'))
await waitFor(() => subagentPage.pop() !== null, 'subagent popover')
check('running children are counted', subagentPage.text().includes('1 个子任务'), subagentPage.text())
check('external children are ignored', !subagentPage.text().includes('2 个子任务'))

// ---------------------------------------------------------------------------
// Chip order stays put while Sessions write events
// ---------------------------------------------------------------------------

const orderBuild = loadPlugin({
  catalog: catalog([
    row('alpha', { title: 'Alpha 会话', running: true, updatedAt: 1 }),
    row('beta', { title: 'Beta 会话', running: true, updatedAt: 2 }),
  ]),
  statuses: new Map(),
})
const orderPage = mount(orderBuild)
await waitFor(() => orderPage.chips().length === 2, 'ordered chips')
check('chips start in catalog order', orderPage.chips()[0].textContent.includes('Alpha'))

orderBuild.sessions.set(
  catalog([
    row('alpha', { title: 'Alpha 会话', running: true, updatedAt: 1 }),
    row('beta', { title: 'Beta 会话', running: true, updatedAt: 99 }),
  ]),
)
await waitFor(() => orderPage.container.querySelector('.drs-bar')?.textContent.includes('2 个会话进行中'), 'after activity')
check('activity does not reshuffle chips', orderPage.chips()[0].textContent.includes('Alpha'), orderPage.chips().map((chip) => chip.textContent).join('|'))

orderBuild.sessions.set(
  catalog([
    row('alpha', { title: 'Alpha 会话', running: true, updatedAt: 1 }),
    row('beta', { title: 'Beta 会话', running: true, updatedAt: 99 }),
    row('gamma', { title: 'Gamma 会话', running: true, updatedAt: 100 }),
  ]),
)
await waitFor(() => orderPage.chips().length === 3, 'third chip')
check('a new run appends at the back', orderPage.chips()[2].textContent.includes('Gamma'), orderPage.chips().map((chip) => chip.textContent).join('|'))

orderBuild.statuses.set(new Map([['beta', { running: true, pendingInteraction: { kind: 'approval' } }]]))
await waitFor(() => orderPage.chips()[0].textContent.includes('Beta'), 'waiting jumps ahead')
check('waiting jumps to the front', orderPage.chips()[0].textContent.includes('Beta') && orderPage.chips()[0].getAttribute('data-waiting') === 'true')
orderPage.unmount()

// ---------------------------------------------------------------------------
// Pure derivation guards
// ---------------------------------------------------------------------------

const api = window.__DSH_RUNNING_SESSIONS_TEST_API__
check('exposes the test API', api !== undefined)
check('basename handles both separators', api.basename('D:\\Work\\alpha') === 'alpha' && api.basename('/srv/beta/') === 'beta')
check('title falls back to the display title', api.titleOf({ title: '  ', displayTitle: 'fallback', id: 'x' }) === 'fallback')
check('title falls back to the id', api.titleOf({ title: '', displayTitle: '  ', id: 'x' }) === 'x')

const derived = api.deriveRunning(
  catalog([
    row('one', { running: true, updatedAt: 5 }),
    row('two', { running: true, updatedAt: 9 }),
    row('three', { running: false }),
  ]),
  new Map([['one', { running: true, pendingInteraction: { kind: 'question' } }]]),
  () => '',
)
check('question-first ordering', derived.map((entry) => entry.id).join(',') === 'one,two')
check('pending kind is carried through', derived[0].pending === 'question')
check('empty catalog yields no rows', api.deriveRunning(catalog([]), new Map(), () => '').length === 0)

const spanish = { running: true, pendingInteraction: { kind: 'plan-review' } }
const unknown = { running: true, pendingInteraction: { kind: 'something-else' } }
check('unknown pending kinds are ignored', api.deriveRunning(catalog([row('a', { running: true })]), new Map([['a', unknown]]), () => '')[0].pending === undefined)
check('plan-review is carried through', api.deriveRunning(catalog([row('a', { running: true })]), new Map([['a', spanish]]), () => '')[0].pending === 'plan-review')

const visitedIds = new Set()
const consumed = api.deriveCompleted(
  catalog([row('x', { retainedBy: { mainView: 1 } })]),
  new Map([['x', { running: false, completionUnread: true }]]),
  () => 'first',
  visitedIds,
)
check('a finish already on screen is consumed', consumed.length === 0 && visitedIds.has('x'))
check('a consumed finish stays hidden', api.deriveCompleted(
  catalog([row('x')]),
  new Map([['x', { running: false, completionUnread: true }]]),
  () => 'first',
  visitedIds,
).length === 0)

// ---------------------------------------------------------------------------
// Projection equality and chip fitting
// ---------------------------------------------------------------------------

const snapshotRow = (id, extra = {}) => ({ id, title: id, workspace: '', pending: undefined, subagents: 0, updatedAt: 1, ...extra })
check('sameRows ignores activity-only updates', api.sameRows([snapshotRow('a', { updatedAt: 1 })], [snapshotRow('a', { updatedAt: 99 })]))
check('sameRows notices a status change', !api.sameRows([snapshotRow('a')], [snapshotRow('a', { pending: 'approval' })]))
check('sameRows notices reordering', !api.sameRows([snapshotRow('a'), snapshotRow('b')], [snapshotRow('b'), snapshotRow('a')]))
check('sameRows notices a title change', !api.sameRows([snapshotRow('a')], [snapshotRow('a', { title: 'renamed' })]))
check('sameRows notices the current marker', !api.sameRows([snapshotRow('a')], [snapshotRow('a', { current: true })]))
check('sameSnapshot notices the finished section', !api.sameSnapshot({ running: [], completed: [] }, { running: [], completed: [snapshotRow('a')] }))
check('sameSnapshot ignores activity-only updates', api.sameSnapshot(
  { running: [], completed: [snapshotRow('a', { updatedAt: 1 })] },
  { running: [], completed: [snapshotRow('a', { updatedAt: 9 })] },
))

check('fitChipCount stops at the budget', api.fitChipCount([200, 200, 200], 600) === 2, String(api.fitChipCount([200, 200, 200], 600)))
check('fitChipCount reserves the overflow button', api.fitChipCount([150, 150, 150, 150], 500, 4, 80) === 2)
check('fitChipCount never returns a negative', api.fitChipCount([200], 100) === 0)
check('visibleChipCount grows with the viewport', api.visibleChipCount([150, 150, 150], 2262) === 3 && api.visibleChipCount([150, 150, 150], 700) === 1, `${api.visibleChipCount([150, 150, 150], 2262)}/${api.visibleChipCount([150, 150, 150], 700)}`)
check('a wider count button leaves room for fewer chips', api.visibleChipCount([160, 160, 160], 1000, 150) === 3 && api.visibleChipCount([160, 160, 160], 1000, 400) === 1, `${api.visibleChipCount([160, 160, 160], 1000, 150)}/${api.visibleChipCount([160, 160, 160], 1000, 400)}`)

check('popover sits under a left trigger', api.popoverLeft(20, 160, 1600, 400) === 20)
check('popover sticks to a right-side trigger', api.popoverLeft(1300, 1450, 1600, 400) === 1050, String(api.popoverLeft(1300, 1450, 1600, 400)))
check('popover stays inside a narrow viewport', api.popoverLeft(300, 360, 500, 400) === 12, String(api.popoverLeft(300, 360, 500, 400)))

// The source must not wake React for activity that cannot change the bar.
const sourceStore = createStore(catalog([row('a', { running: true, updatedAt: 1 })]))
const sourceStatus = createStore(new Map())
const source = api.createRunningSource(sourceStore, sourceStatus, () => new Map())
let notified = 0
source.subscribe(() => {
  notified += 1
})
const initialRows = source.getSnapshot()
check('source lists the running Session', initialRows.running.length === 1 && initialRows.running[0].id === 'a')
sourceStore.set(catalog([row('a', { running: true, updatedAt: 99 })]))
check('an activity-only update stays silent', notified === 0, String(notified))
check('the snapshot identity is kept', source.getSnapshot() === initialRows)
sourceStore.set(catalog([row('a', { running: false })]))
check('a finished run notifies once', notified === 1, String(notified))
check('the empty projection is stable', source.getSnapshot().running.length === 0 && source.getSnapshot() === source.getSnapshot())
sourceStatus.set(new Map([['a', { running: false, completionUnread: true }]]))
check('a finished run lands in its own section', notified === 2 && source.getSnapshot().completed.length === 1 && source.getSnapshot().running.length === 0)
sourceStatus.set(new Map())
check('reading a finished Session clears it', source.getSnapshot().completed.length === 0)
source.dispose()

// ---------------------------------------------------------------------------
// Incremental running index
// ---------------------------------------------------------------------------

const bulkRows = (runningAt) =>
  Array.from({ length: 50 }, (_, index) =>
    row(`bulk-${index}`, { title: `Bulk ${index}`, running: index === runningAt, updatedAt: 1_000 + index }),
  )

const bulkStore = createStore(catalog(bulkRows(-1)))
const bulkStatus = createStore(new Map())
const bulkSource = api.createRunningSource(bulkStore, bulkStatus, () => new Map())
bulkSource.getSnapshot()
check('bulk build tracks every listed Session', bulkSource.stats().tracked === 50 && bulkSource.stats().running === 0)
check('bulk build counts one update per entry', bulkSource.stats().updates === 50, String(bulkSource.stats().updates))

const updatesBeforeFlip = bulkSource.stats().updates
bulkStore.set(catalog(bulkRows(0)))
check(
  'one running flip updates exactly one entry',
  bulkSource.stats().updates - updatesBeforeFlip === 1,
  String(bulkSource.stats().updates - updatesBeforeFlip),
)
check('the flipped Session is the running one', bulkSource.stats().running === 1 && bulkSource.getSnapshot().running[0].id === 'bulk-0')

bulkStore.set(catalog([...bulkRows(0), row('bulk-new', { title: 'Bulk new', running: true, updatedAt: 2_000 })]))
check('adding a Session tracks it', bulkSource.stats().tracked === 51 && bulkSource.stats().running === 2)
bulkStore.set(catalog(bulkRows(0)))
check('removing a Session drops it', bulkSource.stats().tracked === 50 && bulkSource.stats().running === 1)
check('the removed Session leaves the snapshot', !bulkSource.getSnapshot().running.some((entry) => entry.id === 'bulk-new'))

// A driven sequence must land on exactly the same bytes as one full build.
const sequenceStore = createStore(catalog([]))
const sequenceStatus = createStore(new Map())
const incremental = api.createRunningSource(sequenceStore, sequenceStatus, () => new Map())
incremental.getSnapshot()
sequenceStore.set(catalog([row('s1', { title: 'One', running: true, updatedAt: 10 }), row('s2', { title: 'Two' })]))
sequenceStatus.set(new Map([['s2', { running: true }]]))
sequenceStore.set(
  catalog([
    row('s1', { title: 'One renamed', running: true, updatedAt: 10 }),
    row('s2', { title: 'Two', running: true, updatedAt: 11 }),
    row('s3', { title: 'Three', updatedAt: 12 }),
  ]),
)
sequenceStatus.set(new Map([['s3', { running: false, completionUnread: true }]]))
const incrementalSnapshot = incremental.getSnapshot()

const finalCatalog = catalog([
  row('s1', { title: 'One renamed', running: true, updatedAt: 10 }),
  row('s2', { title: 'Two', running: true, updatedAt: 11 }),
  row('s3', { title: 'Three', updatedAt: 12 }),
])
const finalStatuses = new Map([['s3', { running: false, completionUnread: true }]])
const freshSource = api.createRunningSource(createStore(finalCatalog), createStore(finalStatuses), () => new Map())
check('incremental output equals a fresh build', JSON.stringify(incrementalSnapshot) === JSON.stringify(freshSource.getSnapshot()))
check(
  'running rows still match the reference derive',
  JSON.stringify(incrementalSnapshot.running) ===
    JSON.stringify(api.deriveRunning(finalCatalog, finalStatuses, () => '', (id) => incremental.rankOf(id))),
)
check(
  'finished rows still match the reference derive',
  JSON.stringify(incrementalSnapshot.completed) ===
    JSON.stringify(api.deriveCompleted(finalCatalog, finalStatuses, () => '', new Set())),
)
incremental.dispose()
freshSource.dispose()
bulkSource.dispose()

// ---------------------------------------------------------------------------
// Self-test section (plugins.detail.section)
// ---------------------------------------------------------------------------

// Leave no mounted bar behind: the idle check reads the document.
for (const mounted of [page, subagentPage]) {
  try {
    mounted.unmount()
  } catch {}
}
check('no bar is mounted before the self-test runs', document.querySelector('[data-dsh-running-sessions]') === null)

const selftestBuild = loadPlugin({ catalog: catalog([]), statuses: new Map() })
const sectionRegistration = selftestBuild.registrations.find((row) => row.entry.name === 'plugins.detail.section')
check(
  'self-test registers its metadata',
  sectionRegistration !== undefined &&
    sectionRegistration.entry.id === 'dsh-running-sessions.selftest' &&
    sectionRegistration.entry.order === 90 &&
    sectionRegistration.entry.locale === 'running-sessions',
)
check(
  'subject matching accepts both forms',
  api.matchesSelfTestSubject({ kind: 'bundle', pkg: { name: 'dsh-running-sessions' } }) &&
    api.matchesSelfTestSubject({ kind: 'item', id: 'dsh-running-sessions' }) &&
    api.matchesSelfTestSubject({ kind: 'item', id: 'include:dsh-running-sessions' }) &&
    !api.matchesSelfTestSubject({ kind: 'item', id: 'other' }) &&
    !api.matchesSelfTestSubject(undefined),
)

const sectionContainer = document.createElement('div')
document.body.appendChild(sectionContainer)
const sectionRoot = createRoot(sectionContainer)
const sectionT = translator(selftestBuild.dicts.zh)
const renderSection = (subject) =>
  sectionRoot.render(React.createElement(sectionRegistration.component, { subject, t: sectionT }))

renderSection({ kind: 'item', id: 'include:dsh-running-sessions' })
await waitFor(() => sectionContainer.querySelector('.drs-st') !== null, 'self-test section')
check('section renders for the item subject', sectionContainer.querySelector('.drs-st-title')?.textContent === '自检')
check('every check starts idle', sectionContainer.querySelectorAll('.drs-st-badge.is-idle').length === 4)
check('copy starts disabled', sectionContainer.querySelectorAll('.drs-st-btn')[1]?.disabled === true)

sectionContainer.querySelector('.drs-st-btn.is-primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await waitFor(() => sectionContainer.querySelectorAll('.drs-st-badge.is-pass').length === 4, 'four passes')
check('all four checks pass', sectionContainer.querySelectorAll('.drs-st-badge.is-pass').length === 4)
check('summary reports four passes', sectionContainer.querySelector('.drs-st-summary')?.textContent === '4 通过 · 0 失败 · 0 跳过')
check('copy is available after a run', sectionContainer.querySelectorAll('.drs-st-btn')[1]?.disabled === false)

// A broken dependency fails only its own row.
document.querySelectorAll('style[data-plugin-css="dsh-running-sessions/RunningSessions.css"]').forEach((node) => node.remove())
sectionContainer.querySelector('.drs-st-btn.is-primary').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await waitFor(() => sectionContainer.querySelectorAll('.drs-st-badge.is-fail').length === 1, 'one failure')
check(
  'a missing stylesheet fails only its own check',
  sectionContainer.querySelectorAll('.drs-st-badge.is-pass').length === 3 &&
    sectionContainer.querySelectorAll('.drs-st-badge.is-fail').length === 1 &&
    Array.from(sectionContainer.querySelectorAll('.drs-st-row')).some(
      (node) => node.textContent.includes('样式规则已注入') && node.querySelector('.is-fail') !== null,
    ),
)
check('failure keeps a reason', Array.from(sectionContainer.querySelectorAll('.drs-st-detail')).some((node) => node.textContent.length > 0))

const markdown = api.buildSelfTestMarkdown(
  [
    { id: 'a', label: '目录', status: 'pass' },
    { id: 'b', label: '样式', status: 'fail', detail: '缺样式' },
  ],
  sectionT,
)
check('markdown uses the required checkbox shape', markdown.includes('- [x] 目录 — 通过') && markdown.includes('- [ ] 样式 — 失败：缺样式'))

const timedOut = await api.withSelfTestTimeout(() => new Promise(() => {}), 15, sectionT)
check('a hanging check fails after its deadline', timedOut.status === 'fail' && timedOut.detail === '超过 2 秒未完成')

renderSection({ kind: 'item', id: 'another-plugin' })
await new Promise((resolve) => setTimeout(resolve, 40))
check('section hides for other plugins', sectionContainer.querySelector('.drs-st') === null)
sectionRoot.unmount()

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

await new Promise((resolve) => setTimeout(resolve, 20))

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
