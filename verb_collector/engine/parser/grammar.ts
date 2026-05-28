// Tokenizes + validates a sentence into a Sentence AST. The parser is the
// gatekeeper for combat: a valid parse is required before resolve() runs.
//
// Disambiguation rule for `clause CONNECTOR ...`:
//   - if the token after the connector is a verb → second clause
//   - otherwise (adjective/noun)                 → extra noun phrase tail

import {
  AdjectiveId,
  Clause,
  ConnectorId,
  NounId,
  NounPhrase,
  ParseResult,
  VerbId,
} from '../types';
import { VERBS, lookup, wordKind } from '../words';

const MAX_TOKENS = 7;
const MAX_VERBS = 2;

export function parse(rawTokens: string[]): ParseResult {
  const tokens = rawTokens.map((t) => t.toUpperCase());

  if (tokens.length === 0) return reject('empty sentence', tokens);
  if (tokens.length > MAX_TOKENS) return reject(`too long (max ${MAX_TOKENS} words)`, tokens);

  for (const t of tokens) {
    if (lookup(t) === null) return reject(`unknown word: ${t}`, tokens);
  }

  const verbCount = tokens.filter((t) => wordKind(t) === 'verb').length;
  if (verbCount === 0) return reject('sentence must contain a verb', tokens);
  if (verbCount > MAX_VERBS) return reject(`too many verbs (max ${MAX_VERBS})`, tokens);

  const first = parseClause(tokens, 0);
  if (!first.ok) return reject(first.reason, tokens);

  if (first.consumed >= tokens.length) {
    return { ok: true, sentence: { first: first.clause }, tokens };
  }

  const connTok = tokens[first.consumed];
  if (connTok === undefined || wordKind(connTok) !== 'connector') {
    return reject(`expected connector after first clause, got ${connTok ?? 'nothing'}`, tokens);
  }

  const second = parseClause(tokens, first.consumed + 1);
  if (!second.ok) return reject(second.reason, tokens);
  if (second.consumed < tokens.length) {
    return reject('trailing tokens after second clause', tokens);
  }

  return {
    ok: true,
    sentence: {
      first: first.clause,
      conjunction: { connector: connTok as ConnectorId, second: second.clause },
    },
    tokens,
  };
}

type ClauseParse =
  | { ok: true; clause: Clause; consumed: number }
  | { ok: false; reason: string };

function parseClause(tokens: string[], start: number): ClauseParse {
  const verbTok = tokens[start];
  if (verbTok === undefined) return { ok: false, reason: 'expected verb' };
  if (wordKind(verbTok) !== 'verb') return { ok: false, reason: `expected verb, got ${verbTok}` };

  const verb = VERBS[verbTok as VerbId];

  if (verb.target === 'none') {
    return { ok: true, clause: { verb: verb.id }, consumed: start + 1 };
  }

  let i = start + 1;
  let leadingAdj: AdjectiveId | undefined;
  if (verb.target === 'adj_noun') {
    const t = tokens[i];
    if (t !== undefined && wordKind(t) === 'adjective') {
      leadingAdj = t as AdjectiveId;
      i++;
    }
  }

  const nounTok = tokens[i];
  if (nounTok === undefined || wordKind(nounTok) !== 'noun') {
    return { ok: false, reason: `${verb.id} needs a noun` };
  }
  const noun = nounTok as NounId;
  i++;

  let trailingAdj: AdjectiveId | undefined;
  if (verb.target === 'noun_adj') {
    const t = tokens[i];
    if (t === undefined || wordKind(t) !== 'adjective') {
      return { ok: false, reason: `${verb.id} needs an adjective after the noun (e.g. MAKE ENEMY WEAK)` };
    }
    trailingAdj = t as AdjectiveId;
    i++;
  }

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
  if (extra !== undefined) clause.extra = extra;

  return { ok: true, clause, consumed: i };
}

function reject(reason: string, tokens: string[]): ParseResult {
  return { ok: false, reason, tokens };
}
