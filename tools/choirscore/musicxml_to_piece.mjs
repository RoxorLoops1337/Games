#!/usr/bin/env node
// MusicXML -> world_choir_games REPERTOIRE entry.
//
// CPDL (cpdl.org) hosts 51,000-odd choral works and ships MusicXML alongside
// the PDFs, which means the competition standards — Sicut cervus, Locus iste,
// O magnum mysterium, Cantate Domino, Ubi caritas — exist as data rather than
// as something anyone has to transcribe by ear. This converts one of those
// files into the object literal the game's REPERTOIRE array wants.
//
//   node tools/choirscore/musicxml_to_piece.mjs score.musicxml --list
//   node tools/choirscore/musicxml_to_piece.mjs score.musicxml --id sicut \
//        --part P1 --bars 16 --transpose 0
//
// .mxl files are zipped MusicXML: `unzip score.mxl` first and use the .xml
// inside. Only the top line is read — the game harmonises and voices the
// lower parts itself, so a melody and its text is all it needs.
//
// It refuses to emit anything that would fail the game's own test suite:
// notes outside the key, notes outside a soprano's range, bars that do not
// add up, or a syllable count that does not match the notes.

import fs from 'fs';

/* ------------------------------------------------------------------- XML */
/* Small enough to read, big enough for MusicXML. No dependencies. */
const ENTITIES = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
function decode(s){
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1),
                                                          e[1] === 'x' ? 16 : 10));
    return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
  });
}
export function parseXML(src){
  const root = { name:'#root', attrs:{}, children:[], text:'' };
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!(?:[^<>]|<[^>]*>)*>|<(\/)?([A-Za-z_][\w.\-:]*)((?:\s+[\w.\-:]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/)?>/g;
  let last = 0, m;
  while ((m = tag.exec(src))){
    const between = src.slice(last, m.index);
    if (between) stack[stack.length - 1].text += between;
    last = tag.lastIndex;
    if (m[1] !== undefined && m[3] === undefined){        // CDATA
      stack[stack.length - 1].text += m[1];
      continue;
    }
    if (m[3] === undefined) continue;                     // comment / PI / doctype
    if (m[2]){                                            // closing tag
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { name:m[3], attrs:attrs(m[4]), children:[], text:'' };
    stack[stack.length - 1].children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}
function attrs(s){
  const out = {};
  if (!s) return out;
  const re = /([\w.\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = decode(m[2] !== undefined ? m[2] : m[3]);
  return out;
}
const kid = (n, name) => (n ? n.children.find((c) => c.name === name) : undefined);
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const txt = (n) => (n ? decode(n.text).trim() : '');
const numOf = (n, d) => { const v = parseFloat(txt(n)); return Number.isFinite(v) ? v : d; };
function deep(n, name, out){
  out = out || [];
  if (!n) return out;
  for (const c of n.children){ if (c.name === name) out.push(c); deep(c, name, out); }
  return out;
}

/* ------------------------------------------------------------------ music */
const STEP_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const SOPRANO = { lo:60, hi:79 };

export function tonicPc(key, mode){
  let pc = (((key * 7) % 12) + 12) % 12;
  if (mode === 'minor') pc = (pc + 9) % 12;
  return pc;
}
export function scaleOf(key, mode){
  const t = tonicPc(key, mode);
  return (mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS).map((s) => (t + s) % 12);
}

/* Every part in the file, so you can pick one. */
export function listParts(doc){
  const score = kid(doc, 'score-partwise') || doc;
  const list = kid(score, 'part-list');
  const named = {};
  for (const sp of kids(list, 'score-part'))
    named[sp.attrs.id] = txt(kid(sp, 'part-name')) || sp.attrs.id;
  return kids(score, 'part').map((p) => ({ id: p.attrs.id, name: named[p.attrs.id] || p.attrs.id }));
}

/* Pull one line of music out of a MusicXML part. */
export function readPart(doc, opts){
  opts = opts || {};
  const score = kid(doc, 'score-partwise') || doc;
  const parts = kids(score, 'part');
  if (!parts.length) throw new Error('no <part> in this file — is it score-timewise?');
  const part = opts.part ? parts.find((p) => p.attrs.id === opts.part) : parts[0];
  if (!part) throw new Error('no part with id ' + opts.part);

  let divisions = 1, fifths = 0, mode = 'major', beats = 4, beatType = 4, tempo = 0;
  const notes = [];
  const warnings = [];
  let pendingTie = null;
  let firstBarBeats = null, measureIndex = 0;

  for (const measure of kids(part, 'measure')){
    const attr = kid(measure, 'attributes');
    if (attr){
      divisions = numOf(kid(attr, 'divisions'), divisions);
      const k = kid(attr, 'key');
      if (k){
        fifths = numOf(kid(k, 'fifths'), fifths);
        const md = txt(kid(k, 'mode'));
        if (md) mode = md.toLowerCase() === 'minor' ? 'minor' : 'major';
      }
      const t = kid(attr, 'time');
      if (t){ beats = numOf(kid(t, 'beats'), beats); beatType = numOf(kid(t, 'beat-type'), beatType); }
    }
    for (const s of deep(measure, 'sound'))
      if (s.attrs.tempo) tempo = parseFloat(s.attrs.tempo) || tempo;

    let barBeats = 0;
    for (const n of kids(measure, 'note')){
      if (kid(n, 'chord')) continue;                       // keep one line only
      const voice = txt(kid(n, 'voice'));
      if (opts.voice && voice && voice !== String(opts.voice)) continue;
      if (kid(n, 'grace')) continue;
      const dur = numOf(kid(n, 'duration'), 0) / divisions; // in quarter notes
      if (dur <= 0) continue;
      barBeats += dur;
      const rest = !!kid(n, 'rest');
      if (rest){
        if (notes.length){ notes[notes.length - 1].dur += dur; pendingTie = null; }
        else warnings.push('leading rest of ' + dur + ' beats dropped');
        continue;
      }
      const p = kid(n, 'pitch');
      if (!p) continue;
      const midi = (numOf(kid(p, 'octave'), 4) + 1) * 12 +
                   (STEP_PC[txt(kid(p, 'step')).toUpperCase()] || 0) +
                   numOf(kid(p, 'alter'), 0);
      // tied notes are one note, not two
      const ties = kids(n, 'tie').map((t) => t.attrs.type)
        .concat(deep(n, 'tied').map((t) => t.attrs.type));
      if (pendingTie && pendingTie.midi === midi){
        pendingTie.dur += dur;
        pendingTie = ties.includes('start') ? pendingTie : null;
        continue;
      }
      const syl = kids(n, 'lyric').map((l) => txt(kid(l, 'text'))).filter(Boolean).join('');
      const note = { midi, dur, lyric: syl };
      notes.push(note);
      pendingTie = ties.includes('start') ? note : null;
    }
    if (measureIndex === 0) firstBarBeats = barBeats;
    measureIndex++;
  }
  if (!notes.length) throw new Error('that part has no pitched notes in it');

  const barBeats = beats * (4 / beatType);
  const pickup = (firstBarBeats != null && firstBarBeats > 0 && firstBarBeats < barBeats - 1e-6)
    ? firstBarBeats : 0;

  return {
    notes, fifths, mode, beats, beatType, pickup,
    tempo: Math.round(tempo) || 0,
    title: txt(kid(kid(score, 'work'), 'work-title')) ||
           txt(deep(kid(score, 'credit'), 'credit-words')[0]) || '',
    composer: (deep(kid(score, 'identification'), 'creator')
      .find((c) => c.attrs.type === 'composer') || { text:'' }).text.trim(),
    warnings,
  };
}

/* Turn a read part into the entry the game wants, and refuse to emit
   anything the game's own tests would reject. */
export function toEntry(read, opts){
  opts = opts || {};
  const problems = [];
  const warnings = read.warnings.slice();

  const meter = opts.meter || (read.beatType === 4 && (read.beats === 3 || read.beats === 4)
    ? read.beats
    : null);
  if (!meter) problems.push(
    'time signature is ' + read.beats + '/' + read.beatType +
    '; the game plays 3/4 and 4/4 — pass --meter 3 or --meter 4 to force it');

  let notes = read.notes.map((n) => ({ ...n, midi: n.midi + (opts.transpose || 0) }));

  // Trim to whole bars, so the excerpt does not stop mid-phrase.
  if (opts.bars){
    const want = (opts.bars * (meter || 4)) + (read.pickup || 0);
    let total = 0, cut = 0;
    for (; cut < notes.length && total < want - 1e-6; cut++) total += notes[cut].dur;
    notes = notes.slice(0, cut);
  }

  // Octave-shift the whole line into a soprano's range if it sits outside it.
  let lo = Math.min(...notes.map((n) => n.midi)), hi = Math.max(...notes.map((n) => n.midi));
  let shift = 0;
  while (lo + shift < SOPRANO.lo && hi + shift + 12 <= SOPRANO.hi) shift += 12;
  while (hi + shift > SOPRANO.hi && lo + shift - 12 >= SOPRANO.lo) shift -= 12;
  if (shift){
    warnings.push('shifted the line ' + (shift / 12) + ' octave(s) to fit a soprano');
    notes = notes.map((n) => ({ ...n, midi: n.midi + shift }));
    lo += shift; hi += shift;
  }
  if (lo < SOPRANO.lo || hi > SOPRANO.hi)
    problems.push('range is ' + lo + '-' + hi + ', outside a soprano ' +
                  SOPRANO.lo + '-' + SOPRANO.hi + ' even after octave shifting');

  const total = notes.reduce((a, n) => a + n.dur, 0);
  if (meter){
    const after = total - (read.pickup || 0);
    if (Math.abs(after % meter) > 1e-6)
      problems.push('the notes come to ' + total + ' beats with a ' + (read.pickup || 0) +
                    '-beat pickup, which is not whole bars of ' + meter + '/4' +
                    (opts.bars ? '' : ' — try --bars N'));
  }

  const scale = new Set(scaleOf(read.fifths, read.mode));
  if (read.mode === 'minor') scale.add((tonicPc(read.fifths, 'minor') + 11) % 12);
  const outside = [...new Set(notes.map((n) => (((n.midi % 12) + 12) % 12)).filter((pc) => !scale.has(pc)))];
  if (outside.length)
    warnings.push('pitch classes outside the key: ' + outside.join(', ') +
                  ' — fine if the piece is chromatic, a red flag if it is not');

  const missing = notes.filter((n) => !n.lyric).length;
  if (missing)
    warnings.push(missing + ' of ' + notes.length + ' notes have no lyric; they will show as —');

  return {
    entry: {
      id: opts.id || 'piece',
      title: opts.title || read.title || 'Untitled',
      composer: opts.composer || read.composer || 'Traditional',
      origin: opts.origin || 'imported from MusicXML',
      key: read.fifths, mode: read.mode, meter: meter || 4,
      tempo: opts.tempo || read.tempo || 80,
      pickup: read.pickup || 0,
      moods: (opts.moods || 'sacred,calm').split(','),
      mel: notes.map((n) => [n.midi, n.dur]),
      text: notes.map((n) => n.lyric || '—').join(' '),
    },
    problems, warnings,
  };
}

/* The object literal, laid out the way the file already reads. */
export function format(e){
  const rows = [];
  for (let i = 0; i < e.mel.length; i += 4)
    rows.push('         ' + e.mel.slice(i, i + 4).map(([m, d]) => `[${m},${d}]`).join(','));
  return `  { id:'${e.id}', title:${JSON.stringify(e.title)}, composer:${JSON.stringify(e.composer)},
    origin:${JSON.stringify(e.origin)},
    key:${e.key}, mode:'${e.mode}', meter:${e.meter}, tempo:${e.tempo}, pickup:${e.pickup}, moods:[${
    e.moods.map((m) => `'${m}'`).join(',')}],
    mel:[\n${rows.join(',\n').replace(/^ {9}/, '         ')}],
    text:${JSON.stringify(e.text)} },`;
}

/* ------------------------------------------------------------------- cli */
function main(argv){
  const file = argv[0];
  if (!file || file.startsWith('--')){
    console.error('usage: musicxml_to_piece.mjs <score.musicxml> [--list] [--id x] [--part P1]');
    console.error('       [--voice 1] [--meter 3|4] [--bars N] [--transpose N] [--tempo N]');
    console.error('       [--title "..."] [--composer "..."] [--origin "..."] [--moods a,b]');
    return 2;
  }
  const opts = {};
  for (let i = 1; i < argv.length; i++){
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    opts[k] = v;
  }
  const doc = parseXML(fs.readFileSync(file, 'utf8'));
  if (opts.list){
    for (const p of listParts(doc)) console.log(p.id + '\t' + p.name);
    return 0;
  }
  for (const k of ['bars', 'transpose', 'tempo', 'meter', 'voice'])
    if (opts[k] !== undefined && opts[k] !== true) opts[k] = Number(opts[k]);

  const read = readPart(doc, opts);
  const { entry, problems, warnings } = toEntry(read, opts);
  for (const w of warnings) console.error('note:    ' + w);
  for (const p of problems) console.error('PROBLEM: ' + p);
  if (problems.length){
    console.error('\nrefusing to emit — the game\'s own tests would reject this.');
    return 1;
  }
  console.log(format(entry));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
