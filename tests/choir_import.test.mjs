// MusicXML -> REPERTOIRE importer.
//
// Drives the converter in tools/choirscore/ against handwritten MusicXML
// covering the things real CPDL files actually contain: a pickup bar, ties,
// chords, rests, alters, multiple voices and parts, lyrics with syllabic
// hyphens, and a tempo mark. The point of the tool is that nobody has to
// transcribe a competition standard by ear, so the tests care most about it
// refusing to emit anything the game would choke on.
// Run: node tests/choir_import.test.mjs

import { parseXML, listParts, readPart, toEntry, format, scaleOf, tonicPc }
  from '../tools/choirscore/musicxml_to_piece.mjs';

let passed = 0, failed = 0;
function test(name, fn){
  try { fn(); passed++; }
  catch (e){ failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(cond, msg){ if (!cond) throw new Error(msg || 'assertion failed'); }
function near(a, b, eps, msg){
  if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg || 'not near'}: ${a} vs ${b}`);
}

/* A note, in the shape MusicXML writes them. */
const note = (step, oct, dur, opts) => {
  opts = opts || {};
  return `<note>${opts.chord ? '<chord/>' : ''}` +
    (opts.rest ? '<rest/>' : `<pitch><step>${step}</step>` +
      (opts.alter ? `<alter>${opts.alter}</alter>` : '') +
      `<octave>${oct}</octave></pitch>`) +
    `<duration>${dur}</duration>` +
    (opts.voice ? `<voice>${opts.voice}</voice>` : '') +
    (opts.tie ? `<tie type="${opts.tie}"/><notations><tied type="${opts.tie}"/></notations>` : '') +
    (opts.lyric ? `<lyric><syllabic>single</syllabic><text>${opts.lyric}</text></lyric>` : '') +
    '</note>';
};

/* 4/4, one sharp, a one-beat pickup then two whole bars. divisions=1 so a
   duration of 1 is a crotchet. */
const SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Test Motet &amp; Friends</work-title></work>
  <identification><creator type="composer">A. Composer</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes><divisions>1</divisions><key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <sound tempo="72"/>
      ${note('G', 4, 1, { lyric:'Do' })}
    </measure>
    <measure number="1">
      ${note('B', 4, 1, { lyric:'mi' })}
      ${note('D', 5, 1, { lyric:'ne' })}
      ${note('G', 4, 2, { lyric:'sal' })}
      ${note('D', 5, 1, { chord:true })}
    </measure>
    <measure number="2">
      ${note('A', 4, 2, { lyric:'vum', tie:'start' })}
      ${note('A', 4, 1, { tie:'stop' })}
      ${note('F', 4, 1, { alter:1, lyric:'fac' })}
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      ${note('G', 2, 4)}
    </measure>
  </part>
</score-partwise>`;

/* ------------------------------------------------------------------- xml */
test('the parser survives a real MusicXML preamble', () => {
  const doc = parseXML(SIMPLE);
  const score = doc.children.find((c) => c.name === 'score-partwise');
  assert(score, 'no score-partwise — the doctype or the PI ate it');
  assert(score.attrs.version === '3.1', 'attributes are read');
});

test('entities and CDATA come back as text', () => {
  const doc = parseXML(SIMPLE);
  const read = readPart(doc, {});
  assert(read.title === 'Test Motet & Friends', 'entity not decoded: ' + read.title);
  const cd = parseXML('<a><b><![CDATA[x < y]]></b></a>');
  assert(cd.children[0].children[0].text.includes('x < y'), 'CDATA lost');
});

test('self-closing tags do not swallow their siblings', () => {
  const doc = parseXML('<a><b/><c>1</c><d/></a>');
  assert(doc.children[0].children.map((c) => c.name).join(',') === 'b,c,d',
    'got ' + doc.children[0].children.map((c) => c.name).join(','));
});

/* ------------------------------------------------------------------ parts */
test('every part in the file can be listed and picked', () => {
  const doc = parseXML(SIMPLE);
  const parts = listParts(doc);
  assert(parts.length === 2, 'two parts');
  assert(parts[0].id === 'P1' && parts[0].name === 'Soprano', 'named from part-list');
  assert(readPart(doc, { part:'P2' }).notes.length === 1, 'the second part reads on its own');
  let threw = false;
  try { readPart(doc, { part:'nope' }); } catch (e){ threw = true; }
  assert(threw, 'an unknown part id should be an error, not the wrong music');
});

/* ------------------------------------------------------------------ notes */
test('pitches, durations and lyrics come across intact', () => {
  const read = readPart(parseXML(SIMPLE), {});
  const mel = read.notes.map((n) => [n.midi, n.dur]);
  assert(JSON.stringify(mel) === JSON.stringify([[67,1],[71,1],[74,1],[67,2],[69,3],[66,1]]),
    'got ' + JSON.stringify(mel));
  assert(read.notes[5].midi === 66, 'an alter of +1 makes F sharp, got ' + read.notes[5].midi);
  assert(read.notes.map((n) => n.lyric).join(' ') === 'Do mi ne sal vum fac',
    'lyrics: ' + read.notes.map((n) => n.lyric).join(' '));
});

test('a chord keeps one line, and a tie makes one note', () => {
  const read = readPart(parseXML(SIMPLE), {});
  assert(read.notes.length === 6, 'the chord note was counted: ' + read.notes.length);
  const tied = read.notes[4];
  near(tied.dur, 3, 1e-9, 'the tied A should be one note of three beats, got ' + tied.dur);
});

test('a rest lengthens the note before it rather than vanishing', () => {
  const xml = SIMPLE.replace(note('F', 4, 1, { alter:1, lyric:'fac' }),
                             note('', 0, 1, { rest:true }));
  const read = readPart(parseXML(xml), {});
  near(read.notes[read.notes.length - 1].dur, 4, 1e-9,
    'the rest should have been absorbed, got ' + read.notes[read.notes.length - 1].dur);
});

test('key, mode, meter and tempo are read from the attributes', () => {
  const read = readPart(parseXML(SIMPLE), {});
  assert(read.fifths === 1 && read.mode === 'major', 'one sharp, major');
  assert(read.beats === 4 && read.beatType === 4, 'four four');
  assert(read.tempo === 72, 'tempo from the sound element, got ' + read.tempo);
  assert(read.composer === 'A. Composer', 'composer: ' + read.composer);
});

test('a short first bar is recognised as a pickup', () => {
  const read = readPart(parseXML(SIMPLE), {});
  near(read.pickup, 1, 1e-9, 'a one-beat pickup, got ' + read.pickup);
  const noPickup = SIMPLE.replace('<sound tempo="72"/>\n      ' + note('G', 4, 1, { lyric:'Do' }),
                                  note('G', 4, 4, { lyric:'Do' }));
  assert(readPart(parseXML(noPickup), {}).pickup === 0, 'a full first bar is not a pickup');
});

test('divisions other than one still come out in beats', () => {
  const xml = SIMPLE.replace('<divisions>1</divisions>', '<divisions>4</divisions>')
                    .replace(/<duration>(\d+)<\/duration>/g, (m, d) => `<duration>${d * 4}</duration>`);
  const read = readPart(parseXML(xml), {});
  assert(JSON.stringify(read.notes.map((n) => n.dur)) === JSON.stringify([1,1,1,2,3,1]),
    'durations: ' + read.notes.map((n) => n.dur).join(','));
});

test('a voice filter picks one line out of a shared staff', () => {
  const xml = `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
    <measure number="1"><attributes><divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      ${note('C', 5, 2, { voice:1 })}${note('E', 4, 2, { voice:2 })}
      ${note('D', 5, 2, { voice:1 })}${note('F', 4, 2, { voice:2 })}
    </measure></part></score-partwise>`;
  const top = readPart(parseXML(xml), { voice:1 });
  assert(top.notes.map((n) => n.midi).join(',') === '72,74', 'voice 1: ' + top.notes.map((n) => n.midi));
  const low = readPart(parseXML(xml), { voice:2 });
  assert(low.notes.map((n) => n.midi).join(',') === '64,65', 'voice 2: ' + low.notes.map((n) => n.midi));
});

/* ----------------------------------------------------------------- entry */
test('a clean part converts into a usable repertoire entry', () => {
  const read = readPart(parseXML(SIMPLE), {});
  const { entry, problems } = toEntry(read, { id:'test', moods:'sacred' });
  assert(problems.length === 0, 'problems: ' + problems.join('; '));
  assert(entry.id === 'test' && entry.meter === 4 && entry.key === 1, 'header');
  assert(entry.pickup === 1, 'the pickup carries through');
  assert(entry.mel.length === entry.text.split(/\s+/).length,
    'one syllable per note: ' + entry.mel.length + ' vs ' + entry.text.split(/\s+/).length);
  const after = entry.mel.reduce((a, n) => a + n[1], 0) - entry.pickup;
  near(after % entry.meter, 0, 1e-6, 'the bars add up');
  for (const [m] of entry.mel) assert(m >= 60 && m <= 79, m + ' is outside a soprano');
});

test('the emitted literal is valid JavaScript with the right shape', () => {
  const read = readPart(parseXML(SIMPLE), {});
  const { entry } = toEntry(read, { id:'test' });
  const src = format(entry);
  const back = new Function('return [' + src.replace(/,\s*$/, '') + '][0];')();
  assert(back.id === 'test', 'id survives the round trip');
  assert(JSON.stringify(back.mel) === JSON.stringify(entry.mel), 'the melody survives');
  assert(back.text === entry.text, 'the text survives');
  assert(Array.isArray(back.moods) && back.moods.length, 'moods survive');
});

test('a line written for tenors gets octave-shifted into the soprano staff', () => {
  const read = readPart(parseXML(SIMPLE), {});
  read.notes = read.notes.map((n) => ({ ...n, midi: n.midi - 12 }));   // an octave low
  const { entry, problems, warnings } = toEntry(read, { id:'t' });
  assert(problems.length === 0, 'it should fix this, not refuse: ' + problems.join('; '));
  assert(entry.mel.every(([m]) => m >= 60 && m <= 79), 'shifted into range');
  assert(warnings.some((w) => w.includes('octave')), 'and said so');
});

test('a line too wide for any one octave is refused, not mangled', () => {
  const read = readPart(parseXML(SIMPLE), {});
  read.notes = [{ midi:40, dur:2, lyric:'a' }, { midi:84, dur:2, lyric:'b' }];
  const { problems } = toEntry(read, { id:'t' });
  assert(problems.some((p) => p.includes('range')), 'problems: ' + problems.join('; '));
});

test('bars that do not add up are refused', () => {
  const read = readPart(parseXML(SIMPLE), {});
  read.notes.push({ midi:67, dur:1, lyric:'x' });        // one beat too many
  const { problems } = toEntry(read, { id:'t' });
  assert(problems.some((p) => p.includes('whole bars')), 'problems: ' + problems.join('; '));
});

test('a time signature the game cannot play is refused unless forced', () => {
  const xml = SIMPLE.replace('<beats>4</beats><beat-type>4</beat-type>',
                             '<beats>6</beats><beat-type>8</beat-type>');
  const read = readPart(parseXML(xml), {});
  assert(toEntry(read, { id:'t' }).problems.some((p) => p.includes('time signature')),
    '6/8 should be refused by default');
  const forced = toEntry(read, { id:'t', meter:3 });
  assert(forced.entry.meter === 3, '--meter forces it through');
});

test('notes outside the key are a warning, not a refusal', () => {
  const read = readPart(parseXML(SIMPLE), {});
  read.notes[0].midi += 1;                                // a chromatic note
  const { problems, warnings } = toEntry(read, { id:'t' });
  assert(!problems.some((p) => p.includes('key')), 'chromaticism is legal music');
  assert(warnings.some((w) => w.includes('outside the key')), 'but worth saying out loud');
});

test('missing lyrics become melismas rather than gaps', () => {
  const read = readPart(parseXML(SIMPLE), {});
  read.notes[2].lyric = '';
  const { entry, warnings } = toEntry(read, { id:'t' });
  assert(entry.text.split(/\s+/).length === entry.mel.length, 'still one token per note');
  assert(entry.text.split(/\s+/)[2] === '—', 'the empty one became a melisma');
  assert(warnings.some((w) => w.includes('no lyric')), 'and it was flagged');
});

test('--bars trims to whole bars so an excerpt ends where a phrase does', () => {
  const read = readPart(parseXML(SIMPLE), {});
  const { entry } = toEntry(read, { id:'t', bars:1 });
  const total = entry.mel.reduce((a, n) => a + n[1], 0);
  near(total, 1 + 4, 1e-9, 'a pickup plus one bar, got ' + total);
});

test('--transpose moves the whole line together', () => {
  const read = readPart(parseXML(SIMPLE), {});
  const plain = toEntry(read, { id:'t' }).entry.mel;
  const up = toEntry(readPart(parseXML(SIMPLE), {}), { id:'t', transpose:2 }).entry.mel;
  for (let i = 0; i < plain.length; i++)
    assert(up[i][0] - plain[i][0] === 2, 'note ' + i + ' moved ' + (up[i][0] - plain[i][0]));
});

/* ----------------------------------------------------------------- theory */
test('the importer and the game agree on what a key signature means', () => {
  assert(tonicPc(0, 'major') === 0 && tonicPc(1, 'major') === 7 && tonicPc(-1, 'major') === 5,
    'majors');
  assert(tonicPc(0, 'minor') === 9 && tonicPc(-1, 'minor') === 2, 'minors');
  assert(scaleOf(1, 'major').join(',') === '7,9,11,0,2,4,6', 'G major: ' + scaleOf(1, 'major'));
  assert(scaleOf(0, 'minor').join(',') === '9,11,0,2,4,5,7', 'A minor: ' + scaleOf(0, 'minor'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
