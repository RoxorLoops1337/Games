// Core type system for Verb Collector.
//
// Every Word is a tagged record discriminated on `kind`. Exhaustive switches
// in the resolver will fail to compile when a new category is added, which is
// the whole point of writing this engine in TypeScript.

export type WordKind = 'verb' | 'noun' | 'adjective' | 'connector';

// ---- Word ids -------------------------------------------------------------

export type VerbId =
  | 'HIT' | 'WALK' | 'LOOK' | 'GRAB' | 'MAKE' | 'WAIT'
  | 'PUSH' | 'BURN' | 'BLOCK' | 'BREAK' | 'FREEZE' | 'HEAL';

export type AdjectiveId =
  | 'BIG' | 'SMALL' | 'WEAK' | 'STRONG'
  | 'FAST' | 'SLOW' | 'BURNING' | 'FROZEN';

export type PermanentNounId = 'SELF' | 'ENEMY' | 'ROOM' | 'IT';

export type CollectibleNounId =
  | 'GOBLIN' | 'WOLF' | 'MUSHROOM' | 'TREE' | 'THORN' | 'WOOD'
  | 'BIG_GOBLIN' | 'GREEN_KNIGHT';

export type NounId = PermanentNounId | CollectibleNounId;

export type ConnectorId =
  // Spatial
  | 'ON' | 'UNDER' | 'IN' | 'NEAR' | 'BEHIND'
  // Relational
  | 'WITH' | 'AGAINST' | 'FOR' | 'AT'
  // Logical
  | 'AND' | 'OR' | 'BUT' | 'IF' | 'THEN'
  // Temporal
  | 'BEFORE' | 'AFTER' | 'WHILE' | 'UNTIL';

// ---- Verb -----------------------------------------------------------------

export type VerbRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

// Sentence shape a verb expects. The parser uses this to decide whether a
// composed phrase is valid before resolution runs.
export type TargetShape =
  | 'none'       // VERB                (WAIT, BLOCK)
  | 'noun'       // VERB NOUN           (HIT ENEMY)
  | 'adj_noun'   // VERB ADJ NOUN       (reserved; no v1 verb uses this yet)
  | 'noun_adj';  // VERB NOUN ADJ       (MAKE — "MAKE ENEMY WEAK" reads better in English than "MAKE WEAK ENEMY")

export interface Verb {
  kind: 'verb';
  id: VerbId;
  cost: number;
  rarity: VerbRarity;
  target: TargetShape;
  desc: string;
}

// ---- Adjective ------------------------------------------------------------

export type AdjectiveCategory = 'size' | 'state' | 'element' | 'existential';

export interface Adjective {
  kind: 'adjective';
  id: AdjectiveId;
  category: AdjectiveCategory;
  // Turns remaining before the adjective ticks off. 'permanent' means it
  // persists until something explicitly removes it (cancellation, RIP, etc.).
  timer: number | 'permanent';
  opposite?: AdjectiveId;
  desc: string;
}

// ---- Noun -----------------------------------------------------------------

export type NounKind = 'permanent' | 'enemy' | 'object' | 'item';

export type AutoTargetRule =
  | 'self'
  | 'nearest_hostile'
  | 'current_room'
  | 'last_used';

export interface Noun {
  kind: 'noun';
  id: NounId;
  nounKind: NounKind;
  desc: string;
  autoTarget?: AutoTargetRule;
  // Whether this noun can appear in a player-composed sentence. Multi-word
  // collected nouns (BIG GOBLIN) and bosses stay as drop records but aren't
  // referenceable by the parser in v1.
  addressable: boolean;
}

// ---- Connector ------------------------------------------------------------

export type ConnectorCategory = 'spatial' | 'relational' | 'logical' | 'temporal';

export interface Connector {
  kind: 'connector';
  id: ConnectorId;
  category: ConnectorCategory;
  desc: string;
}

// ---- Union ----------------------------------------------------------------

export type Word = Verb | Noun | Adjective | Connector;

// ---- Sentence AST ---------------------------------------------------------
//
// Grammar (v1):
//   Sentence := Clause [Connector Clause]?
//   Clause   := Verb [Adjective] Noun [Connector [Adjective] Noun]?
//            |  Verb                                            (target='none')
//            |  Verb Noun Adjective                             (target='noun_adj')
//
// Hard caps enforced by the parser: ≤7 total tokens, ≤2 verbs.

export interface NounPhrase {
  adjective?: AdjectiveId;
  noun: NounId;
}

export interface Clause {
  verb: VerbId;
  // Optional because target='none' verbs (WAIT, BLOCK) have no object.
  object?: NounPhrase;
  // Trailing adjective for noun_adj-shaped verbs (MAKE GOBLIN WEAK).
  trailingAdjective?: AdjectiveId;
  // Noun-phrase tail joined to this clause by a connector — does NOT
  // introduce a second verb. Example: HIT GOBLIN WITH WOOD.
  extra?: { connector: ConnectorId; right: NounPhrase };
}

export interface Sentence {
  first: Clause;
  // Conjoined second clause introduces a second verb. Example:
  // HIT ENEMY THEN HEAL SELF.
  conjunction?: { connector: ConnectorId; second: Clause };
}

// ---- Parse result ---------------------------------------------------------

export type ParseResult =
  | { ok: true; sentence: Sentence; tokens: string[] }
  | { ok: false; reason: string; tokens: string[] };
