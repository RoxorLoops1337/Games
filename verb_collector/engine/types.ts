// Core type system for Verb Collector.
//
// Every Word is a tagged record discriminated on `kind`. Exhaustive switches
// in the resolver will fail to compile when a new category is added, which is
// the whole point of writing this engine in TypeScript.

export type WordKind = 'verb' | 'noun' | 'adjective' | 'connector';

// ---- Word ids -------------------------------------------------------------

export type VerbId =
  | 'HIT' | 'WALK' | 'LOOK' | 'GRAB' | 'MAKE' | 'WAIT'
  | 'PUSH' | 'BURN' | 'BLOCK' | 'BREAK' | 'FREEZE' | 'HEAL'
  | 'THROW';

export type AdjectiveId =
  | 'BIG' | 'SMALL' | 'WEAK' | 'STRONG'
  | 'FAST' | 'SLOW' | 'BURNING' | 'FROZEN';

export type PermanentNounId = 'SELF' | 'ENEMY' | 'ROOM' | 'IT';

export type CollectibleNounId =
  | 'GOBLIN' | 'WOLF' | 'MUSHROOM' | 'TREE' | 'THORN' | 'WOOD'
  | 'BIG_GOBLIN' | 'GREEN_KNIGHT' | 'GOBLIN_SHAMAN';

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
  | 'none'         // VERB                (WAIT, BLOCK)
  | 'noun'         // VERB NOUN           (HIT ENEMY)
  | 'noun_or_adj'  // VERB NOUN | VERB ADJ — adj form applies to SELF (LOOK STRONG = look strong)
  | 'adj_noun'     // VERB ADJ NOUN       (reserved; no v1 verb uses this yet)
  | 'noun_adj'     // VERB NOUN ADJ       (MAKE — "MAKE ENEMY WEAK" reads better than "MAKE WEAK ENEMY")
  | 'noun_at_noun';// VERB NOUN [AT] NOUN  (THROW — first noun consumed from inventory, second is target)

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
// Grammar:
//   Sentence := Clause (Connector Clause)*
//   Clause   := Verb [Adj] Noun [Connector [Adj] Noun]
//            |  Verb
//            |  Verb Noun Adjective                       (MAKE-apply form)
//            |  Verb Noun Verb                            (MAKE-compel form)
//
// No hard cap on tokens or clauses — energy is the practical limit.

export interface NounPhrase {
  adjective?: AdjectiveId;
  noun: NounId;
}

// A predicate gating whether a clause actually resolves. Built from
// `IF <adjective>` suffixes — checks the clause's object (or SELF when no
// object). Falls through to a log when false.
export type Condition =
  | { kind: 'has_adjective'; adjective: AdjectiveId };

export interface Clause {
  verb: VerbId;
  // Optional because target='none' verbs (WAIT, BLOCK) have no object.
  object?: NounPhrase;
  // Trailing adjective for noun_adj-shaped verbs: MAKE GOBLIN WEAK applies
  // the adjective to the noun, consuming an adjective card from hand.
  trailingAdjective?: AdjectiveId;
  // Trailing verb for the MAKE-compel form: MAKE GOBLIN WALK compels the
  // noun to perform that verb on itself. Does NOT require the verb card in
  // hand — only MAKE is needed.
  trailingVerb?: VerbId;
  // Self-applied adjective for noun_or_adj-shaped verbs (LOOK STRONG = look
  // strong = apply STRONG to SELF for one turn). When set, `object` is unset.
  selfAdjective?: AdjectiveId;
  // Noun-phrase tail joined to this clause by a connector. Different
  // connectors carry different mechanics — WITH/AGAINST/OR/IN/ON/NEAR/
  // UNDER/BEHIND/AT each have their own resolver path.
  extra?: { connector: ConnectorId; right: NounPhrase };
  // For THROW: the second noun is the projectile target (THROW WOOD AT GOBLIN
  // parses object=WOOD, throwTarget=GOBLIN).
  throwTarget?: NounId;
  // For BLOCK AGAINST <enemy>: directs the block at one specific foe.
  againstNoun?: NounId;
  // IF <adj> condition gating the clause — only resolves when the test passes.
  condition?: Condition;
}

export interface ConjunctionEntry {
  connector: ConnectorId;
  clause: Clause;
}

export interface Sentence {
  first: Clause;
  // Additional clauses joined by connectors. Empty for single-clause sentences.
  rest: ConjunctionEntry[];
}

// ---- Parse result ---------------------------------------------------------

export type ParseResult =
  | { ok: true; sentence: Sentence; tokens: string[] }
  | { ok: false; reason: string; tokens: string[] };
