export type RngFn = () => number;

export type BaseColor = 'red' | 'green' | 'blue';

export type ReactionKind = 'melt' | 'chrono' | 'shatter';

export type BossIntentType =
  | 'counter_stance'
  | 'heavy_slam'
  | 'shield_regen'
  | 'void_drain'
  | 'abyss_overdrive';

export interface BossIntent {
  type: BossIntentType;
  title: string;
  description: string;
  bonusDamage: number;
  shieldRegen: number;
  spawnChallenge: boolean;
  pierceGuard: number;
}

export type CardColor =
  | BaseColor
  | 'dual_rg'
  | 'dual_gb'
  | 'dual_rb'
  | 'colorless'
  | 'lantern';

export type SeekerId = 'khor' | 'asha' | 'roland';

export type BossId = 'vainglory_core' | 'kalos_prime' | 'chronos_wyrm';

export type RelicId =
  | 'prism_lens'
  | 'aegis_core'
  | 'chrono_dial'
  | 'vision_amplifier';

export interface RelicDef {
  id: RelicId;
  name: string;
  subtitle: string;
  description: string;
}

export type TemporalStance = 'accelerate' | 'rewind';

export type DifficultyTier = 'normal' | 'heroic' | 'abyss';

export type FieldEchoKind = 'melt_echo' | 'chrono_echo' | 'shatter_echo';

export interface FieldEchoState {
  kind: FieldEchoKind;
  title: string;
  effectText: string;
}

export interface DiscoveredAiCard {
  id: string;
  cardName: string;
  color: BaseColor | 'lantern';
  skillTitle: string;
  damage: number;
  guard: number;
  disruptChallenge: boolean;
  specialNote: string;
  battleCry: string;
  timesUsed: number;
  lastSeenAt: string;
}

export type RaidRank = 'S' | 'A' | 'B' | 'C';

export interface RaidStats {
  totalDamageDealt: number;
  maxSingleHit: number;
  reactionsTriggered: number;
  shieldsBroken: number;
  aiScansCount: number;
  ultimatesUsed: number;
}

export interface BossClearRecord {
  bossId: BossId;
  clears: number;
  bestRank: RaidRank;
  bestRounds: number;
  bestScore: number;
  bestDifficulty?: DifficultyTier;
  lastRelicId: RelicId;
  updatedAt: string;
}

export type RoundPhase =
  | 'boss_stance'
  | 'coop_turn'
  | 'boss_counter'
  | 'maintenance'
  | 'victory'
  | 'defeat';

export type CardKeyword =
  | 'strike'
  | 'guard'
  | 'dice'
  | 'draw'
  | 'rapid'
  | 'disrupt'
  | 'pierce'
  | 'heal';

export interface CardDef {
  id: string; // e.g. KD_KHOR_R01
  seeker: SeekerId | 'shared';
  name: string;
  color: CardColor;
  power: number;
  boostValue: number;
  protection: number;
  diceCount: number; // number of dice rolled (up to 4)
  keywords: CardKeyword[];
  description: string;
}

export interface ShieldPool {
  red: number;
  green: number;
  blue: number;
}

export interface ChallengeCard {
  id: string;
  name: string;
  requiredColor: BaseColor;
  penaltyDamage: number;
  description: string;
}

export interface DiceDieResult {
  index: number;
  face: BaseColor | 'wild' | 'blank';
  bonusPower: number;
}

export interface DiceRollSummary {
  id: number;
  results: DiceDieResult[];
  totalBonus: number;
}

export interface PlayerState {
  slot: 0 | 1;
  seekerId: SeekerId;
  name: string;
  primaryColor: BaseColor;
  lanternCharged: boolean;
  exhaustionCount: number;
  maxHandSize: number;
  cardsInHandEstimate: number;
  actedThisRound: boolean;
}

export interface ActiveActionChain {
  ownerSlot: 0 | 1;
  mainCard: CardDef | null;
  resolvedColor: BaseColor | 'lantern' | null;
  boostCards: CardDef[]; // max 2
}

export interface ScanLogEntry {
  id: number;
  round: number;
  qrCode: string;
  cardName: string;
  playerName: string;
  resolvedColor: BaseColor | 'lantern';
  isBoost: boolean;
  damageDealt: number;
  shieldBroken: boolean;
  note: string;
}

export interface CombatEffectEvent {
  id: number;
  kind:
    | 'card_hit'
    | 'boost_chain'
    | 'shield_break'
    | 'lantern_beam'
    | 'boss_counter'
    | 'boss_enrage'
    | 'boss_unstable'
    | 'blocked'
    | 'exhaustion'
    | 'dice_roll'
    | 'challenge_clear'
    | 'elemental_reaction'
    | 'synergy_ultimate'
    | 'phase_two'
    | 'boss_stagger'
    | 'chain_finisher';
  color: BaseColor | 'lantern' | 'void';
  amount?: number;
  label: string;
}

export interface BossState {
  id: BossId;
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  shields: ShieldPool;
  maxShields: ShieldPool;
  nextShieldBonus: ShieldPool;
  isUnstable: boolean; // +50% incoming damage
  isOverheated: boolean;
  overheatedColor: BaseColor | null;
  invulnerable: boolean; // Kalos Prime barrier until Lantern used
  voidGauge: number; // Kalos Prime 0..3
  wellTriggered: boolean; // Vainglory Core <=25 HP phase
  challenges: ChallengeCard[];
  nextIntentText: string;
  baseCounterAttack: number;
  phase: 1 | 2;
  phase2Triggered: boolean;
  primedElement: BaseColor | null;
  counterWeakened: number;
  intent: BossIntent;
  temporalStance: TemporalStance | null;
  lastBark: string | null;
  staggered: boolean;
  roundReactions: number;
  staggerCount: number;
}

export interface AiCardAction {
  cardName: string;
  color: BaseColor | 'lantern';
  skillTitle: string;
  damage: number;
  guard: number;
  disruptChallenge: boolean;
  specialNote: string;
  battleCry: string;
  reactionHint?: string;
  recommendedRole?: 'breaker' | 'defender' | 'disruptor' | 'burst';
}

export interface PendingColorChoice {
  qrCode: string;
  card: CardDef;
  allowedColors: BaseColor[];
}

export interface LastReactionInfo {
  kind: ReactionKind;
  title: string;
  detail: string;
  id: number;
}

export interface GameState {
  boss: BossState;
  round: number;
  maxRounds: number;
  phase: RoundPhase;
  teamHp: number;
  maxTeamHp: number;
  teamProtection: number;
  synergyGauge: number;
  relicId: RelicId;
  difficulty: DifficultyTier;
  fieldEcho: FieldEchoState | null;
  lastReaction: LastReactionInfo | null;
  stats: RaidStats;
  players: [PlayerState, PlayerState];
  activeChain: ActiveActionChain;
  roundColorCounts: Record<BaseColor, number>;
  lastDiceRoll: DiceRollSummary | null;
  lastAiAction: AiCardAction | null;
  pendingColorChoice: PendingColorChoice | null;
  logs: ScanLogEntry[];
  effectQueue: CombatEffectEvent[];
  nextEventId: number;
  endReason: string | null;
}
