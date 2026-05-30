// Tokenizes + validates a sentence into a Sentence AST. The parser is the
// gatekeeper for combat: a valid parse is required before resolve() runs.
//
// Grammar:
//   Sentence := Clause (Connector Clause)*
//   Clause   := Verb [AT] Noun [Connector [Adj] Noun]
//            |  Verb                                       (target='none')
//            |  Verb [AT] Noun Adjective                   (MAKE-apply form)
//            |  Verb [AT] Noun Verb                        (MAKE-compel form)
//            |  Verb [AT] Adjective                        (noun_or_adj — LOOK STRONG)
//
// `AT` is a prepositional particle that can sit between a verb and its
// object ("LOOK AT ROOM"). It is consumed silently and never grants
// eloquence.
//
// Disambiguation for `clause CONNECTOR ...`:
//   - if the token after the connector is a verb → start of a new clause
//   - otherwise (adjective/noun)                 → extra noun phrase tail

import {
  AdjectiveId,
  Clause,
  ConjunctionEntry,
  ConnectorId,
  NounId,
  NounPhrase,
  ParseResult,
  VerbId,
} from '../types';
import { VERBS, lookup, wordKind } from '../words';

export function parse(rawTokens: string[]): ParseResult {
  const tokens = rawTokens.map((t) => t.toUpperCase());

  if (tokens.length === 0) return reject('empty sentence', tokens);

  for (const t of tokens) {
    if (lookup(t) === null) return reject(`unknown word: ${t}`, tokens);
  }

  const first = parseClause(tokens, 0);
  if (!first.ok) return reject(first.reason, tokens);

  const rest: ConjunctionEntry[] = [];
  let cursor = first.consumed;
  while (cursor < tokens.length) {
    const connTok = tokens[cursor];
    if (connTok === undefined || wordKind(connTok) !== 'connector') {
      return reject(`expected connector between clauses, got ${connTok ?? 'nothing'}`, tokens);
    }
    const nextClause = parseClause(tokens, cursor + 1);
    if (!nextClause.ok) return reject(nextClause.reason, tokens);
    rest.push({ connector: connTok as ConnectorId, clause: nextClause.clause });
    cursor = nextClause.consumed;
  }

  return { ok: true, sentence: { first: first.clause, rest }, tokens };
}

type ClauseParse =
  | { ok: true; clause: Clause; consumed: number }
  | { ok: false; reason: string };

// Skips an optional 'AT' prepositional particle, returning the new cursor.
// AT is grammar sugar — it lets the player write "LOOK AT ROOM" instead of
// "LOOK ROOM" without changing the resolution or granting eloquence.
function skipAt(tokens: string[], i: number): number {
  return tokens[i] === 'AT' ? i + 1 : i;
}

function parseClause(tokens: string[], start: number): ClauseParse {
  const verbTok = tokens[start];
  if (verbTok === undefined) return { ok: false, reason: 'expected verb' };
  if (wordKind(verbTok) !== 'verb') return { ok: false, reason: `expected verb, got ${verbTok}` };

  const verb = VERBS[verbTok as VerbId];

  if (verb.target === 'none') {
    return { ok: true, clause: { verb: verb.id }, consumed: start + 1 };
  }

  let i = skipAt(tokens, start + 1);
  let leadingAdj: AdjectiveId | undefined;
  if (verb.target === 'adj_noun') {
    const t = tokens[i];
    if (t !== undefined && wordKind(t) === 'adjective') {
      leadingAdj = t as AdjectiveId;
      i++;
    }
  }

  // `noun_or_adj` (LOOK): accept an adjective in the noun slot, with no
  // noun, meaning "apply that adjective to SELF for the turn".
  if (verb.target === 'noun_or_adj') {
    const t = tokens[i];
    if (t !== undefined && wordKind(t) === 'adjective') {
      const clause: Clause = { verb: verb.id, selfAdjective: t as AdjectiveId };
      return { ok: true, clause, consumed: i + 1 };
    }
    // Otherwise fall through and parse a noun like the standard form.
  }

  const nounTok = tokens[i];
  if (nounTok === undefined || wordKind(nounTok) !== 'noun') {
    if (verb.target === 'noun_or_adj') {
      return { ok: false, reason: `${verb.id} needs a noun or an adjective (e.g. LOOK ENEMY or LOOK STRONG)` };
    }
    return { ok: false, reason: `${verb.id} needs a noun` };
  }
  const noun = nounTok as NounId;
  i++;

  // For noun_adj-shaped verbs (MAKE), the trailing token can be either an
  // adjective (apply form) or a verb (compel form).
  let trailingAdj: AdjectiveId | undefined;
  let trailingVerb: VerbId | undefined;
  if (verb.target === 'noun_adj') {
    const t = tokens[i];
    const k = t === undefined ? null : wordKind(t);
    if (k === 'adjective') {
      trailingAdj = t as AdjectiveId;
      i++;
    } else if (k === 'verb') {
      trailingVerb = t as VerbId;
      i++;
    } else {
      return {
        ok: false,
        reason: `${verb.id} needs an adjective or verb after the noun (e.g. MAKE ENEMY WEAK or MAKE ENEMY WALK)`,
      };
    }
  }

  // Optional extra noun-phrase tail joined by a connector.
  // Heuristic: a connector followed by a verb starts a new clause; a
  // connector followed by an adjective/noun is an in-clause noun tail.
  let extra: { connector: ConnectorId; right: NounPhrase } | undefined;
  const connTok = tokens[i];
  const lookahead = tokens[i + 1];
  if (
    connTok !== undefined &&
    wordKind(connTok) === 'connector' &&
    lookahead !== undefined &&
    wordKind(lookahead) !== 'verb'
  ) {
    let j = i + 1;
    let extraAdj: AdjectiveId | undefined;
    const lookTok = tokens[j];
    if (lookTok !== undefined && wordKind(lookTok) === 'adjective') {
      extraAdj = lookTok as AdjectiveId;
      j++;
    }
    const extraNoun = tokens[j];
    if (extraNoun === undefined || wordKind(extraNoun) !== 'noun') {
      return { ok: false, reason: `expected noun after ${connTok}` };
    }
    const right: NounPhrase = extraAdj !== undefined
      ? { adjective: extraAdj, noun: extraNoun as NounId }
      : { noun: extraNoun as NounId };
    extra = { connector: connTok as ConnectorId, right };
    i = j + 1;
  }

  const object: NounPhrase = leadingAdj !== undefined
    ? { adjective: leadingAdj, noun }
    : { noun };

  const clause: Clause = { verb: verb.id, object };
  if (trailingAdj !== undefined) clause.trailingAdjective = trailingAdj;
  if (trailingVerb !== undefined) clause.trailingVerb = trailingVerb;
  if (extra !== undefined) clause.extra = extra;

  return { ok: true, clause, consumed: i };
}

function reject(reason: string, tokens: string[]): ParseResult {
  return { ok: false, reason, tokens };
}
