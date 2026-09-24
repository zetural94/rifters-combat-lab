export { createRng, mulberry32, randInt, d10, rngGetState, rngSetState } from "./rng.js";
export { powerRoll, helpRerollLowerDie, tierKey, resolveTierDmg } from "./powerRoll.js";
export { chebyshev, inRange, isFlanking, hasFlank, cellsInRange, actorSize, footprintCells, footprintKeys, atAnchor, footprintInBounds, footprintFree } from "./grid.js";
export { applyDamage, activateDefend, clearDefend } from "./damage.js";
export {
  isHorde,
  hordeUnitsAlive,
  syncHordeAfterHp,
  resolveHordeScaledDmg,
  expandHordeToTokens,
  cullHordeTokens,
  hordePrimary,
  hordeMembers,
  hordeStackInRange,
  queueableEnemies,
  resolveHordeAoeTokenHit,
  promoteHordePrimaryIfNeeded,
} from "./horde.js";
export {
  freshStatuses,
  gatePass,
  applyStatus,
  perfectionistAmp,
  tickStartOfTurnDots,
  shockOnReaction,
  shockOnWillingMove,
  cleanse,
  fearDisadv,
  tauntDisadv,
  stressDisadv,
  woundDisadv,
  gloomDisadv,
  tickGloomAtStartOfTurn,
  statusExtraApCost,
  formatStatusTag,
  formatGateLabel,
  listActorStatusLabels,
  isWeaponAttack,
  isMonsterSpecialAbility,
} from "./status.js";
export {
  activeKitIndex,
  activeKitRef,
  weaponSwap,
  resetKitSwaps,
  normalizeKitParts,
  kitMatchesAbility,
  activeKitParts,
  copyWeaponOptions,
  kitIsWeaponAndShield,
  kitIsTwoHand,
} from "./kits.js";
export {
  apMaxFor,
  refreshAp,
  refreshMonsterSlots,
  isMonsterEconomy,
  spendAp,
  spendMonsterMove,
  spendMonsterAction,
  spendMonsterOa,
  canReact,
  tryPayReaction,
  openReactionWindow,
  closeReactionWindow,
  rushedDisadv,
  noteAttack,
  noteMoved,
  applyStunApPenalty,
  beginTurn,
  endTurn,
  hasWeaponEquipped,
  hasShieldEquipped,
  oaRangeFor,
  tickAbilityCooldowns,
} from "./turn.js";
export { defMapFromCard, makeHero, makeMob } from "./actor.js";
export { resolveStrike, tryDefendReaction, resolveCatchBreath, resolveSupportCatchBreath, resolveSteelYourself, resolveCreateOpening, finishCreateOpeningPick, resolveShove, resolveAskQuestion, resolveHelp, lowestDefDmgType, lowestDefDmgTypeAmong, ELEMENTAL_BOLT_TYPES, resolveInterpose, listInterposeDests, actorCanCrit, resolveMaxTargets, activeWeaponStrike, resolveAbilityTierDamage, critPassiveBonusDmg, abilityTriggersRangedOa } from "./strike.js";
export { pathTo, reachableCells, resolveMove } from "./move.js";
export { applyPush, applyPull, applySlide, applyForcedMove, listLegalPushDirs, HARDNESS, DESTROY_BONUS, resolveObjectCollision } from "./forced.js";
export { legalActions, packHunterBonus } from "./actions.js";
export {
  buildQueue,
  rotateQueueStart,
  createEncounter,
  actorById,
  currentActor,
  advanceTurn,
  applyAction,
  listLegal,
  getReactionAbility,
  heroesEligibleForPick,
  startPickedHeroTurn,
  startDeferredEncounter,
  applyOpportunityAttack,
  listRangedOaCandidates,
  checkOver,
} from "./encounter.js";
export {
  ARENAS,
  arenaObjects,
  normalizeObjects,
  objectBlockKeys,
  materialHp,
  cubeCellsIncluding,
  leaveTerrainHazards,
  applyHazardEnter,
  hazardMap,
} from "./terrain.js";
export { syncBloodiedShell } from "./actor.js";
export {
  spendMana,
  canPayMana,
  activateSystemsBargain,
  placeIceWall,
  iceWallDestroySplash,
  applySpotterMark,
  consumeSpotterAttackBonus,
  activateGuard,
  clearGuard,
  applyShadowDash,
  applyMagicShield,
  applyBlink,
  applyBless,
  blessBonus,
  applyBarkskin,
  barkskinShieldAmount,
  applyStealth,
  clearStealth,
  applyEnhanceWeapon,
  tryRiposte,
  tryHiddenBola,
  applyHealingWater,
  healingWaterBonus,
  activateFeralInvocation,
} from "./feats.js";
export { placeSummon, findSummonOf, dismissSummon, SUMMON_TEMPLATES, summonHpMax } from "./summon.js";
export { chooseEnemyAction, chooseHeroAction, runEnemyTurns, runHeroTurns, pickElementOverride, pickSupportForAbility } from "./ai.js";
// AI move pathing: prefer reachable cells (Bear MC 2026-09-14)
