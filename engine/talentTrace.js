/** Optional per-fight counters. Off unless state.traceTalents is set. */
export function noteTalent(state, ev) {
  if (!state || !state.traceTalents || !ev) return;
  if (!state.talentTrace) state.talentTrace = [];
  state.talentTrace.push(ev);
}
