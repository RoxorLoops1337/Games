import { Connector, ConnectorCategory, ConnectorId } from '../types';

const c = (id: ConnectorId, category: ConnectorCategory, desc: string): Connector =>
  ({ kind: 'connector', id, category, desc });

export const CONNECTORS: Record<ConnectorId, Connector> = {
  // Spatial
  ON:      c('ON',      'spatial',    'Place subject onto noun.'),
  UNDER:   c('UNDER',   'spatial',    'Place subject beneath noun.'),
  IN:      c('IN',      'spatial',    'Place subject inside noun.'),
  NEAR:    c('NEAR',    'spatial',    'Place subject adjacent to noun.'),
  BEHIND:  c('BEHIND',  'spatial',    'Place subject behind noun.'),

  // Relational
  WITH:    c('WITH',    'relational', 'Use noun as instrument or accompaniment.'),
  AGAINST: c('AGAINST', 'relational', 'Direct action opposed to noun.'),
  FOR:     c('FOR',     'relational', 'Direct action toward noun as beneficiary.'),
  AT:      c('AT',      'relational', 'Direct action at noun as target.'),

  // Logical
  AND:     c('AND',     'logical',    'Conjoin clauses or noun phrases.'),
  OR:      c('OR',      'logical',    'Choose one of two clauses or noun phrases.'),
  BUT:     c('BUT',     'logical',    'Conjoin contrasting clauses.'),
  IF:      c('IF',      'logical',    'Conditional: execute clause only if condition holds.'),
  THEN:    c('THEN',    'logical',    'Sequence: execute first clause, then second.'),

  // Temporal
  BEFORE:  c('BEFORE',  'temporal',   'Second clause precedes first.'),
  AFTER:   c('AFTER',   'temporal',   'Second clause follows first.'),
  WHILE:   c('WHILE',   'temporal',   'Clauses execute simultaneously.'),
  UNTIL:   c('UNTIL',   'temporal',   'First clause repeats until second triggers.'),
};

// Connectors the Wanderer starts with unlocked. Others are gated behind
// meta-progression (not implemented in v1 but the list stays here so the UI
// strip knows what to render at run start).
export const STARTER_CONNECTORS: ReadonlyArray<ConnectorId> =
  ['ON', 'WITH', 'AND', 'IF', 'THEN'];
