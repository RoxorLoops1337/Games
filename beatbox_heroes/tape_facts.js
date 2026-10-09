// BEATBOX HEROES -- tape_facts.js: the beatbox history facts the VHS tape on the couch plays (tape.js). Data only. Classic script (BBH.TAPE_FACTS) and a CommonJS module for node tests.
//   { id, era, y (sort key), year (label), text (<= 140 chars, phone readable), src (credit shown on the card), url (where it was checked), vs (optional: the two finalists, name plates on the video) }
// Every fact was checked against the source named in its row (October 2026). Unverifiable claims were left out, for example who invented the inward K snare,
//   the lip roll or the click roll (no source names an inventor), and "Doug E. Fresh was the very first human beatbox" (only promotional bios say so).
// The 2005 final: Joel Turner (Brisbane, Australia) beat RoxorLoops (Brussels, Belgium) in the first Beatbox Battle World Championship final, Leipzig, 9 to 10 September 2005.
//   Sources: the 1st BBBWC results table (beatbox.fandom.com, Turner champion, RoxorLoops vice champion), Joel Turner's Wikipedia biography (champion 2005),
//   RoxorLoops' Wikipedia biography (second place), and the archived final video "Roxorloops vs Joel Turner - Final A - 1st Beatbox Battle World Championship" (YouTube).
//   So the owner's memory of the matchup is right; the title went to Joel Turner.
(function (root) {
  'use strict';
  const ERAS = {
    roots: { name: 'ROOTS', c: '#ffb347', c2: '#ff6b3d' },
    oldschool: { name: 'OLD SCHOOL', c: '#ff3ea5', c2: '#2ee6ff' },
    newschool: { name: 'NEW SCHOOL', c: '#2ee6ff', c2: '#9dff4a' },
    battle: { name: 'BATTLE ERA', c: '#ffd35c', c2: '#ff2f4f' },
    loop: { name: 'LOOP ERA', c: '#b67bff', c2: '#2ee6ff' },
    science: { name: 'SCIENCE', c: '#9dff4a', c2: '#2ee6ff' },
    roxor: { name: 'ROXORLOOPS', c: '#ffd35c', c2: '#ff2f4f' },
  };
  const W = 'https://en.wikipedia.org/wiki/';
  const F = [
    // ------------------------------------------------------------------ roots
    { id: 'konnakol', era: 'roots', y: 1500, year: 'CENTURIES AGO', text: 'Long before hip hop, South Indian konnakol turned drum patterns into spoken syllables, a centuries-old way to teach rhythm.', src: 'Journal of Music; Young Euro Classic', url: 'https://journalofmusic.com/listing/19-02-21/konnakol-spoken-percussion-south-india' },
    { id: 'scat1910', era: 'roots', y: 1910, year: '1910s', text: 'Scat is older than jazz legend says: ragtime singer Gene Greene was already recording scat in the 1910s.', src: 'Wikipedia: Scat singing', url: W + 'Scat_singing' },
    { id: 'heebie', era: 'roots', y: 1926, year: '1926', text: 'Louis Armstrong and his Hot Five cut Heebie Jeebies on 26 February 1926. It became a hit and took scat to the masses.', src: 'Wikipedia: Scat singing', url: W + 'Scat_singing' },
    { id: 'heebie2', era: 'roots', y: 1926.5, year: '1926', text: 'Armstrong liked to say he dropped his lyric sheet mid-take on Heebie Jeebies and just scatted to save the record.', src: 'Pitt Voices: Heebie Jeebies lesson', url: 'https://voices.pitt.edu/LessonPlans/HeebieJeebies.html' },
    { id: 'doowop', era: 'roots', y: 1945, year: '1940s', text: 'Doo-wop groups built songs on a rumbling bass voice under the harmonies: the voice as a rhythm section.', src: 'NPR: The Complete Story of Doo-Wop', url: 'https://www.npr.org/2012/09/06/160670863/harmony-teenagers-and-the-complete-story-of-doo-wop' },
    { id: 'sixty', era: 'roots', y: 1951, year: '1951', text: 'On Sixty Minute Man (1951) bass singer Bill Brown of the Dominoes takes the lead while the group punctuates the lyric.', src: 'NPR: The Complete Story of Doo-Wop', url: 'https://www.npr.org/2012/09/06/160670863/harmony-teenagers-and-the-complete-story-of-doo-wop' },
    // ------------------------------------------------------------------ old school
    { id: 'hiphop', era: 'oldschool', y: 1979, year: 'LATE 70s', text: 'Beatboxing grew up next to rap in the first years of hip hop, mostly backing up rappers at live shows.', src: 'Store norske leksikon: beatboxing', url: 'https://snl.no/beatboxing' },
    { id: 'dougefresh', era: 'oldschool', y: 1984, year: '1984', text: 'Doug E. Fresh released The Original Human Beatbox in 1984. He is hailed as the pioneer of American beatboxing.', src: 'Wikipedia: Doug E. Fresh; HiLoBrow', url: W + 'Doug_E._Fresh' },
    { id: 'kraftwerk', era: 'oldschool', y: 1984.2, year: '1984', text: 'On Just Having Fun (Do the Beatbox), Doug E. Fresh copies the riff, vocals and hi-hats of Kraftwerk\'s Trans Europe Express.', src: 'HiLoBrow: Doug E. Fresh', url: 'https://www.hilobrow.com/2015/09/17/doug-e-fresh/' },
    { id: 'fatboys', era: 'oldschool', y: 1984.4, year: '1984', text: 'The Fat Boys\' 1984 debut, with the track Human Beat Box, is called by many the first hip hop album to feature beatboxing.', src: 'Wikipedia: The Fat Boys', url: W + 'The_Fat_Boys' },
    { id: 'buffy', era: 'oldschool', y: 1984.6, year: '80s', text: 'Buffy of the Fat Boys could not afford DJ gear as a kid, so he started playing the beat with his mouth.', src: 'Keyboard Magazine, via Rock The Bells', url: 'https://rockthebells.com/articles/classic-albums-fat-boys' },
    { id: 'wise', era: 'oldschool', y: 1985, year: '1985', text: 'Wise of Stetsasonic, the Human Mix Machine, brought a human turntable style to their 1985 debut single Just Say Stet.', src: 'Wikipedia: Wise (musician)', url: W + 'Wise_(musician)' },
    { id: 'readyrock', era: 'oldschool', y: 1985.5, year: '1985', text: 'Ready Rock C was the human beatbox of DJ Jazzy Jeff and The Fresh Prince when they released their first single in 1985.', src: 'Wikipedia: Ready Rock C', url: W + 'Ready_Rock_C' },
    { id: 'biz', era: 'oldschool', y: 1986, year: '1986', text: 'Biz Markie released Make the Music with Your Mouth, Biz in 1986, produced by Marley Marl.', src: 'Wikipedia: Make the Music with Your Mouth, Biz', url: W + 'Make_the_Music_with_Your_Mouth,_Biz' },
    // ------------------------------------------------------------------ new school (90s, 2000s)
    { id: 'rahzelroots', era: 'newschool', y: 1995, year: '90s', text: 'Rahzel, the Godfather of Noyze, toured as the human beatbox of The Roots through the 90s.', src: 'The GW Hatchet; Aspen Daily News', url: 'https://www.gwhatchet.com/2003/09/18/the-godfather-of-noyze/' },
    { id: 'killakela', era: 'newschool', y: 1997, year: '1997', text: 'Killa Kela started in 1997 with UK crew 360 Physicals and became the first European beatboxer signed to a major label.', src: 'Wikipedia: Killa Kela', url: W + 'Killa_Kela' },
    { id: 'mt2000', era: 'newschool', y: 1999, year: '1999', text: 'Rahzel\'s debut album Make the Music 2000 came out on 10 August 1999 on MCA Records.', src: 'Wikipedia: Make the Music 2000', url: W + 'Make_the_Music_2000' },
    { id: 'mother', era: 'newschool', y: 1999.5, year: '1999', text: 'On If Your Mother Only Knew, a hidden track, Rahzel beatboxes the beat and sings the chorus at the same time.', src: 'Wikipedia: Make the Music 2000', url: W + 'Make_the_Music_2000' },
    { id: 'kenny', era: 'newschool', y: 1999.8, year: '90s', text: 'Kenny Muhammad became The Human Orchestra after conductor David Eaton wrote Kenny\'s Joy for him.', src: 'Wikipedia (de): Kenny Muhammad', url: 'https://de-academic.com/dic.nsf/dewiki/761058' },
    { id: 'wind', era: 'newschool', y: 2000, year: '2000s', text: 'Kenny Muhammad\'s routine Wind, his take on Kraftwerk\'s Numbers, became a classic that other beatboxers still play.', src: 'rekkerd.org', url: 'https://rekkerd.org/?p=914' },
    { id: 'hbbcom', era: 'newschool', y: 2000.5, year: '2000', text: 'In 2000 Alex Tew (A-Plus) started HUMANBEATBOX.COM, the first online community of beatboxers.', src: 'Wikipedia: Beatboxing', url: W + 'Beatboxing' },
    { id: 'tyte', era: 'newschool', y: 2001, year: '2001', text: 'In 2001 Gavin Tyte of humanbeatbox.com made the first beatbox tutorials, video lessons included.', src: 'Wikipedia: Beatboxing', url: W + 'Beatboxing' },
    { id: 'breath', era: 'newschool', y: 2002, year: '2002', text: 'Breath Control: The History of the Human Beat Box premiered at the 2002 Tribeca Film Festival.', src: 'Wikipedia: Breath Control', url: W + 'Breath_Control:_The_History_of_the_Human_Beat_Box' },
    { id: 'convention', era: 'newschool', y: 2003, year: '2003', text: 'In 2003 the online scene met in person: the world\'s first Human Beatbox Convention, in London.', src: 'Wikipedia: Beatboxing', url: W + 'Beatboxing' },
    { id: 'thesekids', era: 'newschool', y: 2004.5, year: '2004', text: 'Joel Turner\'s beatbox-driven single These Kids went to number one in Australia.', src: 'Wikipedia: These Kids', url: W + 'These_Kids' },
    { id: 'sbn', era: 'newschool', y: 2006.5, year: '2006', text: 'Mark Splinter and Gavin Tyte created Standard Beatbox Notation in 2006, a way to write beats down with letters.', src: 'Wikipedia: Beatboxing', url: W + 'Beatboxing' },
    { id: 'zenger', era: 'newschool', y: 2007, year: '2007', text: 'Finnish beatboxer Felix Zenger was named Artist of the Year at the 2007 Funk Awards.', src: 'Wikipedia: Felix Zenger', url: W + 'Felix_Zenger' },
    { id: 'swissbb', era: 'newschool', y: 2007.1, year: '2007', text: 'Swissbeatbox opened its YouTube channel on 16 January 2007. Today millions watch battles there.', src: 'Social Blade; vidIQ', url: 'https://socialblade.com/youtube/handle/swissbeatbox/achievements' },
    // ------------------------------------------------------------------ battle era
    { id: 'bbbwc1', era: 'battle', y: 2005, year: '2005', text: 'September 2005, Leipzig: the first Beatbox Battle World Championship, started by Alexander Bee-Low Bülow.', src: 'Wikipedia: BBBWC; beatbox.fandom.com', url: W + 'Beatbox_Battle_World_Championship' },
    { id: 'final2005', era: 'battle', y: 2005.1, year: '2005', feature: true, vs: ['ROXORLOOPS', 'JOEL TURNER'], text: 'The first world final: RoxorLoops (Belgium) vs Joel Turner (Australia). Turner took the crown, RoxorLoops vice champion.', src: 'beatbox.fandom.com: BBBWC results; YouTube', url: 'https://www.youtube.com/watch?v=bpSQF7rpi0o' },
    { id: 'team2005', era: 'battle', y: 2005.2, year: '2005', text: 'Same weekend in Leipzig, Joel Turner and Tom Thum won the team battle for Australia.', src: 'Tom Thum biography (Sonicbids)', url: 'https://www.sonicbids.com/band/tom-thum' },
    { id: 'turnerheld', era: 'battle', y: 2005.3, year: '2005-09', text: 'Joel Turner held the world title from 2005 until the next championship in 2009.', src: 'Wikipedia: Joel Turner (musician)', url: W + 'Joel_Turner_(musician)' },
    { id: 'beardyman', era: 'battle', y: 2007.5, year: '2006-07', text: 'Beardyman won the UK Beatbox Championship in 2006 and again in 2007, the first to win two in a row.', src: 'Wikipedia: Beardyman', url: W + 'Beardyman' },
    { id: 'bbbwc2', era: 'battle', y: 2009, year: '2009', text: 'The second world championship moved to Berlin in 2009, at the 2BE Club by the central station.', src: 'NPR All Songs; beatbox.fandom.com', url: 'https://www.npr.org/sections/allsongs/2009/05/the_beatbox_battle_world_champ.html' },
    { id: 'reeps', era: 'battle', y: 2009.2, year: '2009', text: 'Reeps One won the UK title in 2009 and the next year too, matching Beardyman\'s back to back run.', src: 'Wikipedia: UK Beatbox Championships; Strong Island', url: W + 'UK_Beatbox_Championships' },
    { id: 'gbb2009', era: 'battle', y: 2009.5, year: '2009', text: 'The Grand Beatbox Battle was born in 2009 in Switzerland, as part of the BScene festival in Basel.', src: 'Swissbeatbox: About GBB', url: 'https://gbb.swissbeatbox.com/en/about' },
    { id: 'gbb2011', era: 'battle', y: 2011, year: '2011', text: 'Only Swiss beatboxers could enter the early GBBs. In 2011 it opened to the whole world.', src: 'Wikipedia: Grand Beatbox Battle', url: W + 'Grand_Beatbox_Battle' },
    { id: 'skiller', era: 'battle', y: 2012, year: '2012', vs: ['SKILLER', 'ALEM'], text: 'SkilleR from Bulgaria became the third world champion, in Berlin in 2012, beating Alem of France in the final.', src: 'Wikipedia: Alexander Deyanov', url: W + 'Alexander_Deyanov' },
    { id: 'alem', era: 'battle', y: 2015, year: '2015', text: 'Alem became France\'s first men\'s solo world champion in 2015, and won tag team gold with BMG too.', src: 'Wikipedia: Alem (beatboxer)', url: W + 'Alem_(beatboxer)' },
    { id: 'kaila', era: 'battle', y: 2015.5, year: '2015 + 2018', text: 'Kaila Mullady won the women\'s world title in 2015 and again in 2018, the first two-time world champion.', src: 'Wolfman Productions; Scholastic Kid Press', url: 'https://www.wolfmanproductions.com/kaila-mullady' },
    { id: 'alexinho', era: 'battle', y: 2018, year: '2018', vs: ['ALEXINHO', 'B-ART'], text: 'Alexinho of France won the 2018 world title in Berlin, with B-Art of the Netherlands as runner-up.', src: 'beatbox.fandom.com: 5th BBBWC', url: 'https://beatbox.fandom.com/wiki/5th_Beatbox_Battle_World_Championship' },
    { id: 'codfish', era: 'battle', y: 2018.5, year: '2018', vs: ['CODFISH', 'D-LOW'], text: 'Codfish of Australia won the 2018 Grand Beatbox Battle solo final 3-2 against D-low.', src: 'Wikipedia: Grand Beatbox Battle', url: W + 'Grand_Beatbox_Battle' },
    { id: 'dlow', era: 'battle', y: 2019, year: '2019', text: 'The GBB moved to Warsaw in 2019, where D-low of the UK took the solo title.', src: 'Wikipedia: Grand Beatbox Battle', url: W + 'Grand_Beatbox_Battle' },
    { id: 'colaps', era: 'battle', y: 2021, year: '2021', text: 'Colaps from Paris won the solo title at the Grand Beatbox Battle 2021.', src: 'GBB info database', url: 'https://gbbinfo-jpn.onrender.com/en/participant/single/1898' },
    { id: 'tokyo', era: 'battle', y: 2023, year: '2023', text: 'GBB 2023 took over EX Theater Roppongi in Tokyo: the first Grand Beatbox Battle ever held in Asia.', src: 'Real Sound (JP)', url: 'https://realsound.jp/2023/03/post-1277337.html' },
    // ------------------------------------------------------------------ loop era
    { id: 'shlomo', era: 'loop', y: 2011.2, year: '2011', text: 'Shlomo won the first BOSS Loop Station World Championship in 2011 with a mic, his voice and an RC-50.', src: 'Roland press release, 2011', url: 'https://www.roland.com/us/company/press_releases/2011/1223/' },
    { id: 'rc505', era: 'loop', y: 2013, year: '2013', text: 'BOSS unveiled the RC-505 in April 2013: five loop tracks at once, aimed at beatboxers and singers.', src: 'Roland press release, 2013', url: 'https://www.roland.com/us/company/press_releases/2013/1676/' },
    { id: 'gbbloop', era: 'loop', y: 2013.5, year: '2013', text: 'Loopstation joined the Grand Beatbox Battle in 2013 as its own category.', src: 'beatbox.fandom.com: GBB 2013', url: 'https://beatbox.fandom.com/wiki/Grand_Beatbox_Battle_2013' },
    { id: 'tomthum', era: 'loop', y: 2013.8, year: '2013', text: 'Tom Thum\'s 2013 TEDxSydney set at the Sydney Opera House became the most watched TEDx video of its time.', src: 'Andrew McMillen; Yahoo News AU', url: 'https://au.news.yahoo.com/and-the-beat-goes-on-and-on-21300562.html' },
    { id: 'beatness', era: 'loop', y: 2018.2, year: '2018', text: 'French looper Beatness won the GBB Loopstation title in 2018. Rythmind took it in 2019.', src: 'GBB info database', url: 'https://gbbinfo-jpn.onrender.com/en/participant/single/1870' },
    // ------------------------------------------------------------------ science
    { id: 'mri', era: 'science', y: 2018.8, year: '2018', text: 'A USC real-time MRI study found beatboxers make sounds heard in no known language, like the inward click roll.', src: 'Live Science; Smithsonian', url: 'https://livescience.com/64032-beatboxers-mri-scan.html' },
    // ------------------------------------------------------------------ RoxorLoops
    { id: 'rox2004', era: 'roxor', y: 2004, year: '2004', text: 'RoxorLoops, Senjka Danhieux from Belgium, won the Belgian Beatbox Championship in 2004.', src: 'Wikipedia: RoxorLoops', url: W + 'RoxorLoops' },
    { id: 'roxsemi', era: 'roxor', y: 2005.05, year: '2005', text: 'On his way to the first world final, RoxorLoops beat Canada\'s Poizunus in the semi finals.', src: 'beatbox.fandom.com: Canadian Beatbox Championship', url: 'https://beatbox.fandom.com/wiki/Canadian_Beatbox_Championship' },
    { id: 'roxeuro', era: 'roxor', y: 2011.1, year: '2011', text: 'RoxorLoops co-wrote With Love Baby and beatboxed all its drums: Belgium\'s 2011 Eurovision song, by Witloof Bay.', src: 'Wikipedia: Belgium in Eurovision 2011', url: W + 'Belgium_in_the_Eurovision_Song_Contest_2011' },
    { id: 'roxsemi11', era: 'roxor', y: 2011.3, year: '2011', text: 'Witloof Bay, five singers and one beatboxer, finished 11th in their Eurovision semi final with 53 points.', src: 'Wikipedia: Belgium in Eurovision 2011', url: W + 'Belgium_in_the_Eurovision_Song_Contest_2011' },
    { id: 'roxmgp', era: 'roxor', y: 2020, year: '2020', text: 'In 2020 RoxorLoops sang in Denmark\'s Dansk Melodi Grand Prix with Jasmin Rose.', src: 'Wikipedia: RoxorLoops', url: W + 'RoxorLoops' },
    { id: 'roxjudge', era: 'roxor', y: 2024, year: 'TODAY', text: 'Vice world champion RoxorLoops has judged four world beatbox championships and over 30 national ones.', src: 'aavf.dk speaker profile', url: 'https://aavf.dk/speaker/roxorloops/' },
    { id: 'roxdk', era: 'roxor', y: 2024.5, year: 'TODAY', text: 'RoxorLoops lives in Denmark, where he studied vocal leadership and singing at the Royal Academy of Music in Aalborg.', src: 'Wikipedia: RoxorLoops', url: W + 'RoxorLoops' },
  ];
  F.sort((a, b) => a.y - b.y);
  const PER = 5, MAX_LEN = 140;
  // tape k shows PER facts spread through history (strided, so every tape runs from the roots to today, chronological on screen); tape 0 always carries the 2005 final.
  // The pointer (save flags.tapeNext) counts tapes watched; after S = ceil(F / PER) tapes every fact has been seen once and the cycle restarts.
  function tapes() {
    const n = F.length, S = Math.ceil(n / PER), T = [];
    for (let k = 0; k < S; k++) { const t = []; for (let j = 0; j < PER; j++) { const i = k + j * S; if (i < n) t.push(i); } T.push(t); }
    const fi = F.findIndex((f) => f.feature);
    if (fi >= 0) { const fk = fi % S, fj = Math.floor(fi / S); if (fk !== 0 && T[0][fj] !== undefined) { const o = T[0][fj]; T[0][fj] = fi; T[fk][fj] = o; T[fk].sort((a, b) => a - b); T[0].sort((a, b) => a - b); } }
    return T;
  }
  const TAPES = tapes();
  const pick = (k) => { const t = TAPES[((k | 0) % TAPES.length + TAPES.length) % TAPES.length]; return t.map((i) => F[i]); };
  const api = { FACTS: F, ERAS, TAPES, PER, MAX_LEN, pick, count: () => TAPES.length };
  if (root.BBH) root.BBH.TAPE_FACTS = api; else if (typeof window !== 'undefined') { root.BBH = root.BBH || {}; root.BBH.TAPE_FACTS = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
