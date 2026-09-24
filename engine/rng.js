/**
 * Mulberry32 — tiny seeded PRNG. Pass `Math.random` via createRng() for unseeded.
 * Seeded rng exposes _getA / _setA for sandbox undo.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next._getA = function () {
    return a >>> 0;
  };
  next._setA = function (v) {
    a = v >>> 0;
  };
  return next;
}

export function createRng(seed) {
  if (seed == null) return Math.random.bind(Math);
  return mulberry32(seed | 0);
}

export function rngGetState(rng) {
  if (rng && typeof rng._getA === "function") return rng._getA();
  return null;
}

export function rngSetState(rng, a) {
  if (rng && typeof rng._setA === "function" && a != null) rng._setA(a | 0);
}

/** Inclusive integer in [lo, hi]. */
export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function d10(rng) {
  return randInt(rng, 1, 10);
}
