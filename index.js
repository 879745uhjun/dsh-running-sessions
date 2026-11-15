/**
 * dsh-running-sessions — Host half.
 *
 * The feature lives entirely in the browser: the Client Session Controller
 * already publishes every listed Session with a live `running` bit, and the
 * UI session service adds the pending-interaction fact. There is nothing for
 * the Host to compute, store, or serve, so this half only declares the plugin
 * entry that makes the package a profile bundle.
 *
 * @module dsh-running-sessions
 */

/** Cordis plugin name. */
export const name = 'dsh-running-sessions'

/** No Host service is required. */
export const inject = []

/** No Host behavior: the browser half owns the whole feature. */
export function apply() {}
