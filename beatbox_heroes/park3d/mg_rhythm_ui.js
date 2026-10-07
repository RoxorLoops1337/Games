// Busking rhythm game: DOM HUD (score, combo, crowd meter, four big lane pads, popups, start card, count-in, result card).
// Everything scales with one CSS variable --u (hud width / 540) so it is crisp on a phone and on the 9:16 desktop frame.
import { LANES } from './mg_rhythm_hw.js';
import { actButtons, gameActs } from './mg_acts.js';

const CSS = `
.rh{position:absolute;inset:0;pointer-events:none;font-family:var(--f3,"Trebuchet MS",system-ui,sans-serif);color:#fff2dc;--u:1px;overflow:hidden;-webkit-tap-highlight-color:transparent}
.rh *{box-sizing:border-box;pointer-events:none}
.rh button,.rh .pad,.rh .card,.rh .chip{pointer-events:auto;touch-action:none;font-family:inherit}
.rh .top{position:absolute;left:calc(12*var(--u));right:calc(12*var(--u));top:calc(10*var(--u));display:flex;align-items:flex-start;justify-content:space-between;gap:calc(8*var(--u))}
.rh .rbtn{height:calc(40*var(--u));min-width:calc(40*var(--u));padding:0 calc(12*var(--u));border-radius:calc(20*var(--u));border:calc(2*var(--u)) solid #2b2438;background:linear-gradient(#fff2dc,#f2d7a4);color:#2b2438;font-weight:900;font-size:calc(14*var(--u));letter-spacing:.06em;box-shadow:0 calc(3*var(--u)) 0 #2b2438;cursor:pointer}
.rh .rbtn:active{transform:translateY(calc(2*var(--u)));box-shadow:0 calc(1*var(--u)) 0 #2b2438}
.rh .rbtn.on{background:linear-gradient(#b9ff9a,#6fdc5a)}
.rh .score{flex:1;text-align:center;line-height:1;text-shadow:0 calc(2*var(--u)) 0 #2b2438,0 0 calc(14*var(--u)) rgba(255,160,90,.55)}
.rh .score b{display:block;font-size:calc(38*var(--u));font-weight:900;letter-spacing:.02em;color:#fff2dc;-webkit-text-stroke:calc(1.5*var(--u)) #2b2438;paint-order:stroke fill}
.rh .score i{display:block;font-style:normal;font-size:calc(11*var(--u));font-weight:800;letter-spacing:.2em;color:#ffd27a;margin-top:calc(3*var(--u))}
.rh .meter{position:absolute;left:calc(26*var(--u));right:calc(26*var(--u));top:calc(76*var(--u));height:calc(16*var(--u));border-radius:calc(9*var(--u));background:rgba(43,36,56,.78);border:calc(2*var(--u)) solid #2b2438;overflow:visible}
.rh .meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:calc(7*var(--u));background:linear-gradient(90deg,#35f2e0,#ffd23f 55%,#ff3ea5);width:0%;box-shadow:0 0 calc(10*var(--u)) rgba(255,120,200,.7)}
.rh .meter .tick{position:absolute;top:calc(-4*var(--u));width:calc(3*var(--u));height:calc(24*var(--u));background:#2b2438;border-radius:2px}
.rh .meter .lab{position:absolute;top:calc(20*var(--u));font-size:calc(9*var(--u));font-weight:900;letter-spacing:.12em;color:#ffd7b8;opacity:.55;transform:translateX(-50%);text-shadow:0 1px 0 #2b2438;white-space:nowrap}
.rh .meter .lab.on{opacity:1;color:#fff2dc}
.rh .meter .name{position:absolute;left:calc(8*var(--u));top:calc(-1*var(--u));font-size:calc(10*var(--u));font-weight:900;letter-spacing:.14em;color:#fff2dc;text-shadow:0 1px 0 #2b2438;line-height:calc(16*var(--u))}
.rh .combo{position:absolute;left:0;right:0;top:calc(128*var(--u));text-align:center;font-weight:900;font-size:calc(36*var(--u));letter-spacing:.06em;color:#fff2dc;text-shadow:0 calc(2*var(--u)) 0 #2b2438,0 0 calc(16*var(--u)) rgba(255,210,63,.8);-webkit-text-stroke:calc(1.2*var(--u)) #2b2438;paint-order:stroke fill;opacity:0;transform:scale(1)}
.rh .combo small{display:block;font-size:calc(10*var(--u));letter-spacing:.3em;color:#ffd27a;-webkit-text-stroke:0;margin-top:calc(-2*var(--u))}
.rh .combo.on{opacity:1}.rh .combo.bump{animation:rhbump .18s ease-out}
@keyframes rhbump{0%{transform:scale(1.45)}100%{transform:scale(1)}}
.rh .pops{position:absolute;inset:0}
.rh .pop{position:absolute;transform:translate(-50%,-50%);font-weight:900;font-size:calc(24*var(--u));letter-spacing:.05em;white-space:nowrap;-webkit-text-stroke:calc(2*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(3*var(--u)) 0 #2b2438;animation:rhpop .75s ease-out forwards}
.rh .pop.perfect{color:#ffe14d;font-size:calc(27*var(--u))}.rh .pop.good{color:#35f2e0}.rh .pop.miss{color:#ff7b8c;font-size:calc(21*var(--u))}.rh .pop.big{color:#fff2dc;font-size:calc(34*var(--u));letter-spacing:.1em}
@keyframes rhpop{0%{opacity:0;transform:translate(-50%,-30%) scale(.5)}15%{opacity:1;transform:translate(-50%,-60%) scale(1.25)}35%{transform:translate(-50%,-70%) scale(1)}100%{opacity:0;transform:translate(-50%,-190%) scale(1)}}
.rh .pads{position:absolute;left:calc(8*var(--u));right:calc(8*var(--u));bottom:calc(10*var(--u));height:calc(124*var(--u));display:grid;grid-template-columns:repeat(4,1fr);gap:calc(8*var(--u))}
.rh .pad{position:relative;border-radius:calc(18*var(--u));border:calc(3*var(--u)) solid #2b2438;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(2*var(--u));user-select:none;-webkit-user-select:none;transition:transform .05s;overflow:hidden}
.rh .pad::after{content:"";position:absolute;left:8%;right:8%;top:6%;height:30%;border-radius:calc(14*var(--u));background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0))}
.rh .pad svg{width:calc(38*var(--u));height:calc(38*var(--u));filter:drop-shadow(0 calc(2*var(--u)) 0 rgba(43,36,56,.55))}
.rh .pad b{font-size:calc(22*var(--u));font-weight:900;color:#2b2438;line-height:1}
.rh .pad em{font-style:normal;font-size:calc(10*var(--u));font-weight:800;color:rgba(43,36,56,.7);letter-spacing:.14em}
.rh .pad.on{transform:translateY(calc(5*var(--u)) ) scale(.97);filter:brightness(1.25) saturate(1.2)}
.rh .center{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:calc(150*var(--u))}
.rh .count{position:absolute;left:0;right:0;top:34%;text-align:center;font-weight:900;font-size:calc(96*var(--u));color:#fff2dc;-webkit-text-stroke:calc(3*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(6*var(--u)) 0 #2b2438,0 0 calc(30*var(--u)) rgba(255,90,170,.8);opacity:0}
.rh .count.on{animation:rhcount .55s ease-out}
@keyframes rhcount{0%{opacity:0;transform:scale(2)}25%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.85)}}
.rh .card{position:relative;width:calc(400*var(--u));max-width:92%;padding:calc(22*var(--u)) calc(20*var(--u)) calc(20*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(#3a2d58,#2b2040);border:calc(4*var(--u)) solid #2b2438;box-shadow:0 calc(8*var(--u)) 0 #17102b,0 0 calc(40*var(--u)) rgba(255,90,170,.35),inset 0 0 0 calc(2*var(--u)) rgba(255,210,122,.35);text-align:center;animation:rhcard .35s cubic-bezier(.2,1.3,.4,1)}
@keyframes rhcard{0%{opacity:0;transform:translateY(calc(30*var(--u))) scale(.9)}100%{opacity:1;transform:none}}
.rh .card h1{margin:0;font-size:calc(30*var(--u));font-weight:900;letter-spacing:.06em;color:#fff2dc;text-shadow:0 calc(3*var(--u)) 0 #2b2438,0 0 calc(18*var(--u)) rgba(255,62,165,.7)}
.rh .card p{margin:calc(8*var(--u)) 0 calc(14*var(--u));font-size:calc(14*var(--u));line-height:1.35;color:#e6d9ff}
.rh .row{display:flex;gap:calc(8*var(--u));justify-content:center;margin:calc(10*var(--u)) 0}
.rh .chip{padding:calc(9*var(--u)) calc(14*var(--u));border-radius:calc(14*var(--u));border:calc(2*var(--u)) solid #2b2438;background:#4a3d6e;color:#e6d9ff;font-weight:900;font-size:calc(13*var(--u));letter-spacing:.08em;cursor:pointer;box-shadow:0 calc(3*var(--u)) 0 #17102b}
.rh .chip.sel{background:linear-gradient(#ffe88a,#ffbf3f);color:#2b2438}
.rh .go{display:block;width:100%;margin-top:calc(8*var(--u));height:calc(56*var(--u));border-radius:calc(28*var(--u));border:calc(3*var(--u)) solid #2b2438;background:linear-gradient(#ff7ab8,#ff3ea5);color:#fff2dc;font-weight:900;font-size:calc(24*var(--u));letter-spacing:.12em;text-shadow:0 calc(2*var(--u)) 0 #8a1f4d;box-shadow:0 calc(5*var(--u)) 0 #8a1f4d;cursor:pointer}
.rh .go:active{transform:translateY(calc(3*var(--u)));box-shadow:0 calc(2*var(--u)) 0 #8a1f4d}
.rh .go.alt{background:linear-gradient(#5ff6ec,#27c8bb);text-shadow:0 calc(2*var(--u)) 0 #0f6a85;box-shadow:0 calc(5*var(--u)) 0 #0f6a85;font-size:calc(18*var(--u));height:calc(46*var(--u))}
.rh .grade{font-size:calc(120*var(--u));font-weight:900;line-height:.95;margin:calc(2*var(--u)) 0 0;-webkit-text-stroke:calc(4*var(--u)) #2b2438;paint-order:stroke fill;text-shadow:0 calc(8*var(--u)) 0 #2b2438}
.rh .gl{font-size:calc(13*var(--u));font-weight:900;letter-spacing:.3em;color:#ffd27a;margin-bottom:calc(10*var(--u))}
.rh .stats{display:grid;grid-template-columns:1fr 1fr;gap:calc(6*var(--u)) calc(14*var(--u));text-align:left;margin:calc(8*var(--u)) 0 calc(6*var(--u));padding:calc(10*var(--u)) calc(14*var(--u));background:rgba(23,16,43,.55);border-radius:calc(14*var(--u))}
.rh .stats span{font-size:calc(12*var(--u));font-weight:800;letter-spacing:.1em;color:#c9b9ec}.rh .stats b{float:right;font-size:calc(15*var(--u));color:#fff2dc}
.rh .lanes{display:flex;gap:calc(6*var(--u));justify-content:center;margin:calc(6*var(--u)) 0 calc(8*var(--u))}
.rh .lanes div{width:calc(56*var(--u));text-align:center;font-weight:900;font-size:calc(11*var(--u));color:#2b2438;border-radius:calc(8*var(--u));padding:calc(4*var(--u)) 0;border:calc(2*var(--u)) solid #2b2438}
.rh .toast{position:absolute;left:50%;top:calc(184*var(--u));max-width:92%;overflow:hidden;text-overflow:ellipsis;transform:translateX(-50%);padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(14*var(--u));background:rgba(43,36,56,.9);border:calc(2*var(--u)) solid #ffd27a;color:#fff2dc;font-size:calc(12*var(--u));font-weight:800;letter-spacing:.06em;opacity:0;visibility:hidden;transition:opacity .25s,visibility 0s .25s;white-space:nowrap}
.rh .toast.on{opacity:1;visibility:visible;transition:opacity .25s}
.rh .flash{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,rgba(255,255,255,.0),rgba(255,255,255,.0));opacity:0}
.rh .hdr{position:absolute;left:calc(26*var(--u));top:calc(126*var(--u));display:flex;flex-direction:column;align-items:flex-start;gap:calc(5*var(--u));opacity:0;transition:opacity .25s;max-width:calc(226*var(--u))}
.rh .hdr.on{opacity:1}
.rh .hdr i{font-style:normal;padding:calc(3*var(--u)) calc(10*var(--u));border-radius:calc(10*var(--u));background:rgba(43,36,56,.82);border:calc(2*var(--u)) solid #ffd27a;font-weight:900;font-size:calc(11*var(--u));letter-spacing:.1em;color:#fff2dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.rh .hdr i.s{border-color:#35f2e0;color:#bffcf6}
.rh .hdr i.t{border-color:#ff3ea5;color:#ffc2e2}
.rh.nohud .top .score,.rh.nohud .meter,.rh.nohud .combo,.rh.nohud .pads,.rh.nohud .hdr{opacity:0;transition:opacity .2s}
.rh .top .score,.rh .meter,.rh .pads{transition:opacity .25s}
.rh .vs{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rh .vs .dim{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(10,4,28,0),rgba(10,4,28,.6));animation:vsdim .35s ease-out both}
.rh .vs .band{position:absolute;left:-12%;width:124%;height:calc(176*var(--u));display:flex;flex-direction:column;justify-content:center;gap:calc(2*var(--u))}
.rh .vs .bA{top:calc(150*var(--u));transform:skewY(-7deg);background:linear-gradient(90deg,rgba(255,62,165,.9) 0%,rgba(122,61,255,.74) 58%,rgba(122,61,255,0) 100%);padding-left:16%;animation:vsL .55s cubic-bezier(.15,1.1,.3,1) both;box-shadow:0 calc(8*var(--u)) 0 rgba(23,16,43,.6)}
.rh .vs .bB{bottom:calc(250*var(--u));transform:skewY(-7deg);background:linear-gradient(270deg,rgba(53,242,224,.9) 0%,rgba(61,122,255,.74) 58%,rgba(61,122,255,0) 100%);padding-right:16%;align-items:flex-end;animation:vsR .55s .18s cubic-bezier(.15,1.1,.3,1) both;box-shadow:0 calc(8*var(--u)) 0 rgba(23,16,43,.6)}
.rh .vs .nm{font-weight:900;font-size:calc(58*var(--u));line-height:.95;letter-spacing:.02em;color:#fff2dc;-webkit-text-stroke:calc(4*var(--u)) #17102b;paint-order:stroke fill;text-shadow:0 calc(6*var(--u)) 0 #17102b;white-space:nowrap;text-transform:uppercase}
.rh .vs .sb{font-weight:900;font-size:calc(15*var(--u));letter-spacing:.24em;color:#ffe9a0;text-shadow:0 calc(2*var(--u)) 0 #17102b;text-transform:uppercase}
.rh .vs .big{position:absolute;left:0;right:0;top:calc(280*var(--u));text-align:center;font-weight:900;font-size:calc(230*var(--u));line-height:1;letter-spacing:-.02em;color:#ffe14d;-webkit-text-stroke:calc(10*var(--u)) #17102b;paint-order:stroke fill;text-shadow:0 calc(14*var(--u)) 0 #5a2a9a,0 0 calc(60*var(--u)) rgba(255,62,165,.85),calc(7*var(--u)) calc(7*var(--u)) 0 #2a0f5a;animation:vsStamp .62s .5s cubic-bezier(.2,2.2,.4,1) both;font-style:italic}
.rh .vs .tag{position:absolute;left:0;right:0;bottom:calc(150*var(--u));text-align:center;font-weight:900;font-size:calc(14*var(--u));letter-spacing:.3em;color:#fff2dc;text-shadow:0 calc(2*var(--u)) 0 #17102b;animation:vsFade .5s 1s both}
.rh .vs .quote{position:absolute;left:calc(26*var(--u));right:calc(26*var(--u));bottom:calc(70*var(--u));padding:calc(10*var(--u)) calc(16*var(--u));border-radius:calc(16*var(--u));background:rgba(23,16,43,.82);border:calc(2*var(--u)) solid #ffd27a;text-align:center;font-weight:800;font-size:calc(15*var(--u));line-height:1.3;color:#fff2dc;animation:vsFade .4s 1.4s both}
.rh .vs .quote b{display:block;color:#ff9ad0;font-size:calc(11*var(--u));letter-spacing:.2em;margin-bottom:calc(3*var(--u))}
.rh .vs .fl{position:absolute;inset:0;background:#fff;animation:vsFlash .5s .5s ease-out both}
.rh .vs.out{animation:vsOut .5s ease-in forwards}
@keyframes vsdim{0%{opacity:0}100%{opacity:1}}
@keyframes vsL{0%{transform:translateX(-120%) skewY(-7deg)}100%{transform:translateX(0) skewY(-7deg)}}
@keyframes vsR{0%{transform:translateX(120%) skewY(-7deg)}100%{transform:translateX(0) skewY(-7deg)}}
@keyframes vsStamp{0%{opacity:0;transform:scale(4) rotate(-8deg)}60%{opacity:1;transform:scale(.92) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(-3deg)}}
@keyframes vsFade{0%{opacity:0;transform:translateY(calc(10*var(--u)))}100%{opacity:1;transform:none}}
@keyframes vsFlash{0%{opacity:.95}100%{opacity:0}}
@keyframes vsOut{0%{opacity:1}100%{opacity:0;transform:scale(1.08)}}
.rh .pk{max-width:94%}
.rh .pk .fav{margin:calc(2*var(--u)) 0 calc(10*var(--u));font-size:calc(12*var(--u));letter-spacing:.06em;color:#ffd27a}
.rh .pk .st{display:flex;align-items:center;gap:calc(12*var(--u));width:100%;margin-top:calc(8*var(--u));padding:calc(8*var(--u)) calc(14*var(--u));text-align:left;border-radius:calc(20*var(--u));border:calc(3*var(--u)) solid #2b2438;color:#2b2438;cursor:pointer;box-shadow:0 calc(5*var(--u)) 0 #17102b;font-family:inherit}
.rh .pk .st:active{transform:translateY(calc(3*var(--u)));box-shadow:0 calc(2*var(--u)) 0 #17102b}
.rh .pk .st b{font-size:calc(24*var(--u));font-weight:900;letter-spacing:.08em;min-width:calc(92*var(--u))}
.rh .pk .st span{display:block;font-size:calc(12*var(--u));font-weight:800;line-height:1.25}
.rh .pk .st em{display:block;font-style:normal;font-size:calc(10*var(--u));font-weight:900;letter-spacing:.12em;opacity:.75;margin-top:calc(1*var(--u))}
.rh .pk .st.fv{outline:calc(3*var(--u)) dashed #ffe14d;outline-offset:calc(2*var(--u))}
.rh .jd{position:absolute;inset:0}
.rh .jd .tally{position:absolute;left:0;right:0;top:calc(96*var(--u));display:flex;justify-content:center;align-items:center;gap:calc(16*var(--u));font-weight:900;text-shadow:0 calc(3*var(--u)) 0 #17102b}
.rh .jd .tally div{min-width:calc(150*var(--u));padding:calc(6*var(--u)) calc(12*var(--u));border-radius:calc(16*var(--u));border:calc(3*var(--u)) solid #2b2438;text-align:center;line-height:1}
.rh .jd .tally .y{background:linear-gradient(#7af0ff,#27c8bb);color:#17102b;text-shadow:none}
.rh .jd .tally .o{background:linear-gradient(#ff9ad0,#ff3ea5);color:#17102b;text-shadow:none}
.rh .jd .tally b{display:block;font-size:calc(52*var(--u))}
.rh .jd .tally small{display:block;font-size:calc(11*var(--u));letter-spacing:.14em;margin-top:calc(2*var(--u))}
.rh .jd .tally b.bump{animation:rhbump .3s ease-out}
.rh .jd .pips{position:absolute;left:calc(16*var(--u));right:calc(16*var(--u));bottom:calc(150*var(--u));display:flex;gap:calc(8*var(--u));justify-content:center}
.rh .jd .pip{flex:1;max-width:calc(96*var(--u));padding:calc(8*var(--u)) 0 calc(6*var(--u));border-radius:calc(14*var(--u));border:calc(3*var(--u)) solid #2b2438;background:rgba(43,36,56,.86);text-align:center;font-weight:900;letter-spacing:.06em;color:#c9b9ec;transition:background .2s}
.rh .jd .pip i{display:block;font-style:normal;font-size:calc(10*var(--u));opacity:.8}
.rh .jd .pip b{display:block;font-size:calc(26*var(--u));line-height:1.1}
.rh .jd .pip.y{background:linear-gradient(#7af0ff,#27c8bb);color:#17102b;animation:rhpip .35s ease-out}
.rh .jd .pip.o{background:linear-gradient(#ff9ad0,#ff3ea5);color:#17102b;animation:rhpip .35s ease-out}
@keyframes rhpip{0%{transform:scale(1.18) translateY(calc(-6*var(--u)))}100%{transform:none}}
.rh .jd .say{position:absolute;left:calc(22*var(--u));right:calc(22*var(--u));bottom:calc(250*var(--u));padding:calc(10*var(--u)) calc(16*var(--u));border-radius:calc(16*var(--u));background:rgba(23,16,43,.88);border:calc(2*var(--u)) solid #ffd27a;text-align:center;opacity:0;transform:translateY(calc(10*var(--u)));transition:all .25s}
.rh .jd .say.on{opacity:1;transform:none}
.rh .jd .say b{display:block;font-size:calc(12*var(--u));letter-spacing:.2em;color:#ffd27a}
.rh .jd .say span{display:block;font-size:calc(15*var(--u));font-weight:800;margin:calc(3*var(--u)) 0;color:#fff2dc;line-height:1.3}
.rh .jd .say u{display:block;text-decoration:none;font-size:calc(13*var(--u));font-weight:900;letter-spacing:.08em;color:#c9b9ec}
.rh .jd .say u em{font-style:normal;color:#7af0ff}.rh .jd .say u s{text-decoration:none;color:#ff9ad0}
.rh .vd{animation:rhcard .5s cubic-bezier(.2,1.4,.4,1)}
.rh .vd h1{font-size:calc(46*var(--u));letter-spacing:.08em}
.rh .vd.win h1{color:#ffe14d;text-shadow:0 calc(4*var(--u)) 0 #2b2438,0 0 calc(30*var(--u)) rgba(255,210,63,.9)}
.rh .vd.lose h1{color:#ff7b8e;text-shadow:0 calc(4*var(--u)) 0 #2b2438,0 0 calc(26*var(--u)) rgba(255,47,79,.7)}
.rh .rw{display:flex;gap:calc(8*var(--u));justify-content:center;flex-wrap:wrap;margin:calc(8*var(--u)) 0 calc(4*var(--u));min-height:calc(34*var(--u))}
.rh .rw .c{padding:calc(6*var(--u)) calc(12*var(--u));border-radius:calc(12*var(--u));border:calc(2*var(--u)) solid #2b2438;font-weight:900;font-size:calc(15*var(--u));letter-spacing:.06em;color:#17102b;box-shadow:0 calc(3*var(--u)) 0 #17102b;animation:rhbump .4s ease-out}
.rh .rw .c.g{background:linear-gradient(#ffe88a,#ffbf3f)}.rh .rw .c.c{background:linear-gradient(#9af6ee,#27c8bb)}.rh .rw .c.l{background:linear-gradient(#d4ff9a,#8fe04a)}
.rh .cf{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,4,28,.55);pointer-events:auto}
.rh .cf .card{pointer-events:auto}
.rh .cf .row button{pointer-events:auto}
`;
const SHAPES = [
  '<svg viewBox="0 0 40 40"><polygon points="20,3 35,11.5 35,28.5 20,37 5,28.5 5,11.5" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><polygon points="20,4 37,34 3,34" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><rect x="6" y="6" width="28" height="28" rx="3" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
  '<svg viewBox="0 0 40 40"><polygon points="20,2 33,20 20,38 7,20" fill="#fff4d6" stroke="#2b2438" stroke-width="3" stroke-linejoin="round"/></svg>',
];
const GRADE_COL = { S: '#ffe14d', A: '#9dff4a', B: '#35f2e0', C: '#ff9a4a', D: '#ff6b7a' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export function buildUI(hud, api) {
  if (!document.querySelector('style[data-rhythm]')) { const s = document.createElement('style'); s.setAttribute('data-rhythm', '1'); s.textContent = CSS; document.head.appendChild(s); }
  const root = el('div', 'rh'); root.setAttribute('data-rhythm', 'hud'); hud.appendChild(root);
  const U = {}; let popsN = 0, toastT = 0, u = 1;
  // top bar
  const top = el('div', 'top'), back = el('button', 'rbtn', 'BACK'), mic = el('button', 'rbtn', 'MIC OFF'), sc = el('div', 'score', '<b>0</b><i>SCORE</i>');
  back.onclick = () => api.quit(); mic.onclick = () => api.toggleMic(); top.append(back, sc, mic); root.appendChild(top); U.score = sc.firstChild; U.mic = mic; U.back = back;
  if (!api.hasMic) mic.style.visibility = 'hidden';
  // crowd meter
  const meter = el('div', 'meter', '<div class="fill"></div><div class="name">CROWD</div>'); U.fill = meter.querySelector('.fill');
  [[0.33, 'LIGHTS'], [0.6, 'CONFETTI'], [0.85, 'FIREWORKS']].forEach(([p, name]) => { const t = el('div', 'tick'); t.style.left = p * 100 + '%'; const l = el('div', 'lab', name); l.style.left = p * 100 + '%'; l.dataset.p = p; meter.append(t, l); });
  root.appendChild(meter); U.meter = meter;
  const hdr = el('div', 'hdr', ''); root.appendChild(hdr); U.hdr = hdr;
  const combo = el('div', 'combo', '0<small>COMBO</small>'); root.appendChild(combo); U.combo = combo;
  const pops = el('div', 'pops'); root.appendChild(pops); U.pops = pops;
  const count = el('div', 'count', '3'); root.appendChild(count); U.count = count;
  const toast = el('div', 'toast', ''); root.appendChild(toast); U.toast = toast;
  // pads
  const pads = el('div', 'pads'); U.pads = [];
  LANES.forEach((L, i) => {
    const p = el('div', 'pad', SHAPES[i] + '<b>' + L.name + '</b><em>' + L.keys[0].replace('Key', '') + '</em>'); p.style.background = 'linear-gradient(' + L.hi + ',' + L.color + ' 55%,' + L.dark + ')'; p.style.boxShadow = '0 calc(6*var(--u)) 0 #17102b, 0 0 calc(18*var(--u)) ' + L.color + '88, inset 0 calc(-8*var(--u)) 0 ' + L.dark + '55';
    p.addEventListener('pointerdown', (e) => { e.preventDefault(); try { p.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } p.classList.add('on'); api.press(i, { fromUI: true }); });
    const up = () => p.classList.remove('on'); p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('lostpointercapture', up); p.addEventListener('contextmenu', (e) => e.preventDefault());
    pads.appendChild(p); U.pads.push(p);
  });
  root.appendChild(pads);
  let card = null;
  function clearCard() { if (card) { card.remove(); card = null; } }
  function showStart(cfg) {
    clearCard(); const wrap = el('div', 'center'); const c = el('div', 'card'); c.innerHTML = '<h1>BUSKING SET</h1><p>Hit the gems as they reach the glowing ring.<br>Tap the pads or press <b>D F J K</b>. Beatbox into the mic if you like.</p>';
    const row = el('div', 'row'); const levels = [['EASY', 0.2], ['MEDIUM', 0.5], ['HARD', 0.85]]; let sel = cfg.difficulty; const near = levels.reduce((b, l) => (Math.abs(l[1] - sel) < Math.abs(b[1] - sel) ? l : b), levels[1]); sel = near[1];
    const chips = levels.map(([n, v]) => { const b = el('button', 'chip' + (v === sel ? ' sel' : ''), n); b.onclick = () => { sel = v; chips.forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }; row.appendChild(b); return b; });
    const go = el('button', 'go', 'START'); go.onclick = () => { clearCard(); api.start({ difficulty: sel, fromUI: true }); };
    c.append(row, go); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let rwPending = null;
  function rwHtml(rw) {
    const chips = []; if (rw.cash) chips.push('<div class="c g">+$' + rw.cash + '</div>'); if (rw.fans) chips.push('<div class="c c">+' + rw.fans + ' FANS</div>'); if (rw.gain) chips.push('<div class="c c">+' + (+rw.gain).toFixed(1) + ' ' + String(rw.stat || 'TECH').toUpperCase() + '</div>'); chips.push('<div class="c l">+' + (rw.xp || 0) + ' XP</div>'); return chips.join('');
  }
  // the game's result card buttons (AGAIN / BACK / CONTINUE): rebuilt when the rewards land, so a greyed AGAIN reads the save after the action
  let actsOn = null;
  function drawActs() { const A = actsOn; if (!A || !A.c.isConnected) return; const old = A.c.querySelector('[data-acts]'); if (old) old.remove(); const acts = gameActs({ acts: A.fn }); if (!acts) return; const box = el('div', ''); box.setAttribute('data-acts', '1'); box.style.cssText = 'display:flex;flex-wrap:wrap;gap:calc(8*var(--u));margin-top:calc(8*var(--u))'; actButtons(A.c.ownerDocument || document, box, acts, { row: false, cls: 'go', alt: 'alt', go: A.go }); box.querySelectorAll('button').forEach((b) => { b.style.margin = '0'; b.style.flex = b.dataset.act === 'continue' ? '1 1 100%' : '1 1 40%'; if (b.dataset.act !== 'continue') b.style.fontSize = 'calc(18*var(--u))'; }); A.c.appendChild(box); }
  function setRewards(rw) {
    rwPending = rw || null; drawActs(); const box = root.querySelector('.rw'); if (!box || !rw) return; box.innerHTML = rwHtml(rw); box.setAttribute('data-cash', rw.cash || 0); box.setAttribute('data-fans', rw.fans || 0); box.setAttribute('data-xp', rw.xp || 0);
  }
  // result card of a perform or practice set. o: { game, onContinue(r) }. In the game the rewards chips are filled by setRewards() and CONTINUE hands control back to the scene.
  function showResult(r, again, o) {
    o = o || {}; clearCard(); U.toast.classList.remove('on'); const wrap = el('div', 'center'), c = el('div', 'card'), gc = GRADE_COL[r.grade] || '#fff2dc';
    const praise = r.grade === 'S' ? 'FLAWLESS SET!' : r.grade === 'A' ? 'THE CROWD LOVES YOU' : r.grade === 'B' ? 'NICE GROOVE' : r.grade === 'C' ? 'KEEP PRACTISING' : 'TOUGH CROWD';
    c.innerHTML = '<div class="gl">' + (o.label ? esc(o.label) + ' - ' : '') + praise + '</div><div class="grade" style="color:' + gc + '">' + r.grade + '</div>' +
      '<div class="stats"><span>SCORE<b>' + r.score + '</b></span><span>ACCURACY<b>' + Math.round(r.accuracy * 100) + '%</b></span><span>PERFECT<b>' + r.perfect + '</b></span><span>GOOD<b>' + r.good + '</b></span><span>MISS<b>' + r.miss + '</b></span><span>BEST COMBO<b>' + r.bestCombo + '</b></span></div>' +
      '<div class="lanes">' + LANES.map((L, i) => '<div style="background:' + L.color + '">' + L.name + ' ' + r.perfectLane[i] + '</div>').join('') + '</div>' + (r.battle ? '<p>' + (r.battle.win ? 'YOU WIN THE BATTLE' : 'YOU LOSE THE BATTLE') + ' (' + r.battle.forPlayer + '/5 judges)</p>' : '');
    actsOn = null;
    if (o.game && o.acts) { const rw = el('div', 'rw'); c.appendChild(rw); actsOn = { c, fn: o.acts, go: () => { if (o.onContinue) o.onContinue(r); } }; wrap.appendChild(c); root.appendChild(wrap); card = wrap; U.back.style.visibility = 'hidden'; drawActs(); if (rwPending) setRewards(rwPending); return; }
    if (o.game) {
      const rw = el('div', 'rw'); c.appendChild(rw); const go = el('button', 'go', 'CONTINUE'); go.setAttribute('data-act', 'continue'); go.onclick = () => { go.disabled = true; if (o.onContinue) o.onContinue(r); }; c.appendChild(go); wrap.appendChild(c); root.appendChild(wrap); card = wrap; U.back.style.visibility = 'hidden'; if (rwPending) setRewards(rwPending); return;
    }
    const a = el('button', 'go', 'PLAY AGAIN'), b = el('button', 'go alt', 'BACK TO THE PARK'); a.onclick = () => { clearCard(); again(); }; b.onclick = () => api.quit(); c.append(a, b); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  // style picker. opp: { name, fav[] }, styles: Core.STYLES, beats: Core.STYLE_BEATS (key beats value)
  function showPicker(styles, round, opp, onPick, beats) {
    clearCard(); opp = typeof opp === 'string' ? { name: opp } : (opp || {}); beats = beats || {}; const wrap = el('div', 'center'), c = el('div', 'card pk'), fav = (opp.fav || []).map((f) => String(f).toUpperCase()).join(' + ');
    c.innerHTML = '<h1>ROUND ' + (round + 1) + '</h1><p style="margin-bottom:0">' + esc(opp.name || 'Rival') + ' is waiting. Beat their style for a bonus.</p>' + (fav ? '<div class="fav">LIKES ' + esc(fav) + '</div>' : '<div class="fav"></div>');
    const COL = { boom: LANES[0], hats: LANES[1], snare: LANES[2], rim: LANES[3] };
    styles.forEach((st) => {
      const L = COL[st.id] || LANES[0], b = el('button', 'st' + ((opp.fav || []).indexOf(st.id) >= 0 ? ' fv' : ''), '<b>' + esc(st.name) + '</b><div><span>' + esc(st.desc || '') + ' in your chart</span>' + (beats[st.id] ? '<em>BEATS ' + esc(String(beats[st.id]).toUpperCase()) + '</em>' : '') + '</div>');
      b.style.background = 'linear-gradient(' + L.hi + ',' + L.color + ' 60%,' + L.dark + ')'; b.setAttribute('data-style', st.id); b.onclick = () => { clearCard(); onPick(st.id); }; c.appendChild(b);
    });
    c.appendChild(el('p', '', '<span style="font-size:calc(11*var(--u));letter-spacing:.1em;color:#c9b9ec">BOOM &gt; HATS &gt; RIM &gt; SNARE &gt; BOOM</span>')); wrap.appendChild(c); root.appendChild(wrap); card = wrap;
  }
  // VS splash overlay (battle start). d: { you, opp, sub, youSub, tag, taunt, tauntBy }
  let vsEl = null;
  function showVs(d) {
    hideVs(true); vsEl = el('div', 'vs');
    vsEl.innerHTML = '<div class="dim"></div><div class="band bA"><div class="sb">' + esc(d.youSub || 'CHALLENGER') + '</div><div class="nm">' + esc(d.you || 'YOU') + '</div></div>' +
      '<div class="band bB"><div class="sb">' + esc(d.sub || '') + '</div><div class="nm">' + esc(d.opp || 'RIVAL') + '</div></div><div class="big">VS</div><div class="tag">' + esc(d.tag || 'BEATBOX BATTLE  -  5 JUDGES  -  3 ROUNDS') + '</div>' +
      (d.taunt ? '<div class="quote"><b>' + esc(d.tauntBy || d.opp || '') + '</b>' + esc(d.taunt) + '</div>' : '') + '<div class="fl"></div>';
    root.appendChild(vsEl);
  }
  function hideVs(now) { if (!vsEl) return; const e = vsEl; vsEl = null; if (now) { e.remove(); return; } e.classList.add('out'); setTimeout(() => e.remove(), 520); }
  // judges overlay: tally + one pip per judge + the quote card
  let jd = null;
  function showJudges(names, youName, oppName) {
    hideJudges(); jd = el('div', 'jd'); const pips = names.map((n) => '<div class="pip"><i>' + esc(String(n).toUpperCase()) + '</i><b>?</b></div>').join('');
    jd.innerHTML = '<div class="tally"><div class="y"><b>0</b><small>' + esc(String(youName || 'YOU').toUpperCase().slice(0, 10)) + '</small></div><div class="o"><b>0</b><small>' + esc(String(oppName || 'RIVAL').toUpperCase().slice(0, 12)) + '</small></div></div><div class="say"></div><div class="pips">' + pips + '</div>';
    root.appendChild(jd); jd._pips = [...jd.querySelectorAll('.pip')]; jd._say = jd.querySelector('.say'); jd._y = jd.querySelector('.tally .y b'); jd._o = jd.querySelector('.tally .o b');
  }
  function revealJudge(i, v, tally) {
    if (!jd) return; const p = jd._pips[i]; if (p) { p.className = 'pip ' + (v.forPlayer ? 'y' : 'o'); p.querySelector('b').textContent = v.forPlayer ? 'YOU' : 'THEM'; }
    jd._y.textContent = tally.you; jd._o.textContent = tally.opp; const t = v.forPlayer ? jd._y : jd._o; t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
    jd._say.innerHTML = '<b>' + esc(String(v.name || '').toUpperCase()) + ' SAYS</b><span>' + esc(v.quip || '') + '</span><u><em>YOU ' + esc(v.youTxt || '') + '</em>  :  <s>' + esc(v.oppTxt || '') + ' THEM</s></u>'; jd._say.classList.add('on');
  }
  function hideJudges() { if (jd) { jd.remove(); jd = null; } }
  // verdict card of a battle. v: { win, forPlayer, oppName, line }, o: { game, onContinue(v), onAgain }
  function showVerdict(v, o) {
    o = o || {}; clearCard(); hideJudges(); const wrap = el('div', 'center'), c = el('div', 'card vd ' + (v.win ? 'win' : 'lose'));
    c.innerHTML = '<div class="gl">' + (v.win ? 'THE CROWD GOES WILD' : 'NOT TONIGHT') + '</div><h1>' + (v.win ? 'VICTORY!' : 'DEFEAT') + '</h1><p>' + v.forPlayer + ' of 5 judges voted for you</p><p style="margin-top:0">' + esc(v.line || '') + '</p>';
    actsOn = null;
    if (o.game && o.acts) { const rw = el('div', 'rw'); c.appendChild(rw); actsOn = { c, fn: o.acts, go: () => { if (o.onContinue) o.onContinue(v); } }; wrap.appendChild(c); root.appendChild(wrap); card = wrap; U.back.style.visibility = 'hidden'; drawActs(); if (rwPending) setRewards(rwPending); return; }
    const rw = el('div', 'rw'); c.appendChild(rw); const go = el('button', 'go', o.game ? 'CONTINUE' : 'PLAY AGAIN'); go.setAttribute('data-act', 'continue'); go.onclick = () => { go.disabled = true; if (o.game) { if (o.onContinue) o.onContinue(v); } else if (o.onAgain) { clearCard(); o.onAgain(); } }; c.appendChild(go);
    if (!o.game) { const b = el('button', 'go alt', 'BACK'); b.onclick = () => api.quit(); c.appendChild(b); }
    wrap.appendChild(c); root.appendChild(wrap); card = wrap; U.back.style.visibility = 'hidden'; if (rwPending) setRewards(rwPending);
  }
  // are-you-sure card (game mode BACK). Resolves through the two callbacks.
  let cf = null;
  function confirmLeave(o) {
    if (cf) return; cf = el('div', 'cf'); const c = el('div', 'card'); c.innerHTML = '<h1>LEAVE?</h1><p>' + esc(o.body || 'You will lose this set (no rewards, no time spent).') + '</p>';
    const row = el('div', 'row'), stay = el('button', 'go alt', 'STAY'), leave = el('button', 'go', 'LEAVE'); stay.setAttribute('data-act', 'stay'); leave.setAttribute('data-act', 'leave'); stay.style.margin = '0'; leave.style.margin = '0'; leave.style.background = 'linear-gradient(#ff8a9a,#ff3f5e)';
    stay.onclick = () => { closeConfirm(); if (o.onStay) o.onStay(); }; leave.onclick = () => { closeConfirm(); if (o.onLeave) o.onLeave(); }; row.append(stay, leave); c.appendChild(row); cf.appendChild(c); root.appendChild(cf);
  }
  function closeConfirm() { if (cf) { cf.remove(); cf = null; } }
  return {
    root, el: U, showStart, showResult, showPicker, showVs, hideVs, showJudges, revealJudge, hideJudges, showVerdict, confirmLeave, closeConfirm, setRewards, clearCard, hasCard: () => !!card, hasConfirm: () => !!cf,
    // header chips under the crowd meter: [{ t: text, k: '' | 's' | 't' }]
    setHeader(chips) { U.hdr.innerHTML = (chips || []).map((c) => '<i class="' + (c.k || '') + '">' + esc(c.t) + '</i>').join(''); U.hdr.classList.toggle('on', !!(chips && chips.length)); },
    setMeterName(t) { const n = U.meter.querySelector('.name'); if (n && n.textContent !== t) n.textContent = t; },
    setHud(on) { root.classList.toggle('nohud', !on); },
    setBackVisible(v) { U.back.style.visibility = v ? 'visible' : 'hidden'; },
    resize(w, h) { u = w / 540; root.style.setProperty('--u', u + 'px'); },
    setScore(v) { U.score.textContent = String(Math.round(v)); },
    setCombo(n, bump) { U.combo.classList.toggle('on', n >= 2); if (n >= 2) { U.combo.firstChild.nodeValue = n; if (bump) { U.combo.classList.remove('bump'); void U.combo.offsetWidth; U.combo.classList.add('bump'); } } },
    setEnergy(e) { const k = Math.round(e * 100); if (k === U.lastE) return; U.lastE = k; U.fill.style.width = k + '%'; if (!U.labs) U.labs = [...U.meter.querySelectorAll('.lab')]; U.labs.forEach((l) => l.classList.toggle('on', e >= +l.dataset.p)); },
    pop(text, grade, x, y, big) { if (popsN > 7) return; popsN++; const p = el('div', 'pop ' + grade + (big ? ' big' : ''), text); p.style.left = x + 'px'; p.style.top = y + 'px'; U.pops.appendChild(p); setTimeout(() => { p.remove(); popsN--; }, 760); },
    countdown(txt) { U.count.textContent = txt; U.count.classList.remove('on'); void U.count.offsetWidth; U.count.classList.add('on'); },
    hideToast() { clearTimeout(toastT); U.toast.classList.remove('on'); },
    toast(msg, ms) { U.toast.textContent = msg; U.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => U.toast.classList.remove('on'), ms || 2000); },
    setMic(on) { U.mic.textContent = on ? 'MIC ON' : 'MIC OFF'; U.mic.classList.toggle('on', on); },
    padFlash(i) { const p = U.pads[i]; p.classList.add('on'); setTimeout(() => p.classList.remove('on'), 70); },
    dispose() { root.remove(); },
  };
}
