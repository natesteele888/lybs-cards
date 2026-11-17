/* Steele Cards card renderer: the real Steele Cards look (712 x 1000, layered like the PSD), for the Card Maker
   and anything else that builds a card.

   The drawing code below is the card builder's own, copied as it was (admin builder, "LYBS CARDS" folder,
   June 2026): the woven background, the LYBS side banner, the notched photo window, the white stitched frame
   and blue position bar, the Knights logo chrome, Anton italic name, Michroma position, the MAC badge, and the
   parallels (tints, Rainbow Foil, Holo Foil, Cracked Ice, Bubble Prizm, Gold Numbered, Opening Day...).
   The back is the builder's landscape stat-sheet back. Red, Blue and Black tint at 80% (the builder had 40%,
   40% and 52%), per Nathan's rule that colored parallels must clearly read as colored. Otherwise only three
   things changed: offscreen canvases come from
   _mk() so the same code runs in Node tests, the Gold Numbered serial reads CS instead of form fields, and
   everything lives inside this wrapper instead of on the page.

   SteeleCard.loadLayers(base)        loads the template art from <base>/layers/ (once)
   SteeleCard.render(canvas, opts)    draws one side. opts: { side:'front'|'back', parallel, data, photo,
                                      imgScale, imgOffsetX, imgOffsetY, rotX, rotY, mx, my, accentColor }
   SteeleCard.photoBox()              the photo window in card pixels (for dragging the photo)
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SteeleCard = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

/* ═══════════════════════════════════════════
   CONSTANTS — exact pixel measurements from PSD
═══════════════════════════════════════════ */
const PW = 712, PH = 1000;

// Photo mask shape (from layer 03 pixel analysis):
// Diagonal notch top-left: from (315,47) → (60,100) at slope -1px X per 1px Y
// Body: left=60 right=663 top=100 bottom=897
const MASK = {
  // Key points of the polygon
  x0:315, y0:47,   // notch top point
  x1:663, y1:47,   // top-right
  x2:663, y2:897,  // bottom-right
  x3:60,  y3:897,  // bottom-left
  x4:60,  y4:100,  // notch bottom-left
  // Notch goes diagonally from (x4,y4) to (x0,y0) — slope = (315-60)/(47-100) = -4.8px per px
};

// Name text bounds (from layer 08): left=324 top=829 right=664 bottom=901
const NAME_X = 324, NAME_Y = 886, NAME_MAXW = 308;
const NAME_ONE_LINE_MIN = 40; // below this a one-line name reads too small, so it splits

// Where the front's name goes: [{ text, size, y, squeeze }], one line or two, baseline y.
// squeeze < 1 narrows a word too long to fit even at the smallest size, instead of letting it
// run off the card.
function nameLayout(ctx, fn, ln) {
  const fit = (text, start, min) => {
    let size = start;
    ctx.font = `italic ${size}px Anton,sans-serif`;
    while (ctx.measureText(text).width > NAME_MAXW && size > min) { size -= 2; ctx.font = `italic ${size}px Anton,sans-serif`; }
    const m = ctx.measureText(text);
    return { text, size, squeeze: m.width > NAME_MAXW ? NAME_MAXW / m.width : 1, ascent: m.actualBoundingBoxAscent || size * 0.8 };
  };
  const one = fit(fn ? fn + ' ' + ln : ln, 58, fn ? NAME_ONE_LINE_MIN : 22);
  if (!fn || one.squeeze === 1) return [{ text: one.text, size: one.size, y: NAME_Y, squeeze: one.squeeze }];
  const last = fit(ln, 52, 30);
  const first = fit(fn, Math.max(20, Math.round(last.size * 0.66)), 18);
  // first name's baseline sits a clear gap above the top of the last name's capitals
  const gap = Math.max(8, Math.round(last.size * 0.16));
  return [
    { text: first.text, size: first.size, y: Math.round(NAME_Y - last.ascent - gap), squeeze: first.squeeze },
    { text: last.text, size: last.size, y: NAME_Y, squeeze: last.squeeze },
  ];
}

// Position text bounds (from layer 07): left=506 top=917 right=656 bottom=950
const POS_X = 506, POS_Y = 942, POS_MAXW = 152;

/* ═══════════════════════════════════════════
   PARALLELS
═══════════════════════════════════════════ */
const PAR = {
  base:        {name:'BASE',          sw:'#aaaaaa', tint:null,               glow:null},
  silver:      {name:'SILVER',        sw:'#c8c8d0', tint:[200,200,215,0.30], glow:[200,200,220]},
  blue:        {name:'BLUE',          sw:'#1a4aaa', tint:[20,70,210,0.80],   glow:[40,100,220]},
  red:         {name:'RED',           sw:'#cc1122', tint:[200,15,35,0.80],   glow:[200,20,40]},
  gold:        {name:'GOLD',          sw:'#c09020', tint:[190,140,15,0.38],  glow:[195,145,35]},
  green:       {name:'GREEN',         sw:'#0a6a2a', tint:[15,140,55,0.38],   glow:[15,145,55]},
  orange:      {name:'ORANGE',        sw:'#cc4400', tint:[200,75,10,0.38],   glow:[205,80,15]},
  purple:      {name:'PURPLE',        sw:'#6010a8', tint:[125,15,205,0.38],  glow:[135,25,215]},
  rainbow:     {name:'RAINBOW FOIL',  sw:'rainbow', tint:null,               glow:[255,180,0]},
  holo:        {name:'HOLO FOIL',     sw:'holo',    tint:null,               glow:[70,155,255]},
  sandglitter: {name:'SANDGLITTER',   sw:'#ffd700', tint:[215,165,0,0.32],   glow:[255,200,0]},
  diamante:    {name:'DIAMANTE',      sw:'#b0d8f8', tint:[115,175,235,0.28], glow:[155,205,255]},
  black:       {name:'BLACK 1/1',     sw:'#222222', tint:[0,0,0,0.80],       glow:null},
  auto:        {name:'CERTIFIED AUTO',sw:'#cc0018', tint:[195,8,28,0.38],   glow:[200,15,45]},
  ice:         {name:'CRACKED ICE',     sw:'ice',     tint:null,               glow:[180,220,255]},
  numbered:    {name:'GOLD NUMBERED',   sw:'#c8a020', tint:[180,130,0,0.25],   glow:[220,180,40]},
  bubbles:     {name:'BUBBLE PRIZM',    sw:'holo',    tint:null,               glow:[150,210,255]},
  openingday:  {name:'OPENING DAY',     sw:'#2a72c8', tint:null,               glow:[80,160,230]},
};

/* ── Renderer state (the builder's CS, minus its form and sign-in bits) ── */
const DEFAULTS = {
  parallel:'base', flipped:false, flipT:0,
  mx:0.5, my:0.5, rotX:0, rotY:0,
  breakout:false, breakoutPoly:null,
  accentColor:'#1546a0', accentSat:100,
  logoScale:1.0, logoOffsetX:0, logoOffsetY:0, showBanner:true,
  macImg:null, serialPos:'br', serialNum:1, printRun:50,
  photoImg:null, logoImg:null, sigImg:null,
  data:{},
  imgScale:1.0, imgOffsetX:0, imgOffsetY:0,
};
let CS = Object.assign({}, DEFAULTS);
const LAYERS = {};
const LAYER_FILES = { bg:'bg.jpg', banner:'banner.png', frame:'frame.png', shadow:'shadow.png', logo:'logo.png', mac:'mac.png', photo_mask:'photo_mask.png' };
let _mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function photoMaskPath(ctx){
  ctx.beginPath();
  ctx.moveTo(MASK.x0, MASK.y0);       // notch top  (315, 47)
  ctx.lineTo(MASK.x1, MASK.y1);       // top-right  (663, 47)
  ctx.lineTo(MASK.x2, MASK.y2);       // bot-right  (663, 897)
  ctx.lineTo(MASK.x3, MASK.y3);       // bot-left   (60,  897)
  ctx.lineTo(MASK.x4, MASK.y4);       // notch bot  (60,  100)
  ctx.closePath();                     // diagonal back to (315, 47)
}

/* ── Draw player photo using FRAME as compositor mask ──
   Uses offscreen canvas + destination-in so the photo is ONLY
   visible through the exact transparent hole in layer 04 (frame).
   Eliminates all bleed at the diagonal notch corner. ── */
/* ── 3D Breakout: duplicate a top slice of the player above the frame ──
   The user defines a band (L/R %, top/bottom in PSD px). That band is
   re-rendered from the photo and drawn ON TOP of the frame so the hat/head
   appears to break out of the white border. A soft drop shadow sells the 3D. ── */
function drawBreakout(ctx){
  const img=CS.photoImg; if(!img) return;
  const poly=CS.breakoutPoly; if(!poly||poly.length<3) return;
  const areaW=MASK.x1-MASK.x4, areaH=MASK.y2-MASK.y0;
  const iw=img.naturalWidth||200, ih=img.naturalHeight||300;
  const baseScale=Math.max(areaW/iw, areaH/ih);
  const sc=baseScale*(CS.imgScale||1);
  const dw=iw*sc, dh=ih*sc;
  const dx=(MASK.x4+MASK.x1)/2 - dw/2 + (CS.imgOffsetX||0);
  const dy=(MASK.y0+MASK.y2)/2 - dh/2 + (CS.imgOffsetY||0);

  // Render full photo to temp canvas (same transform as main photo)
  const tmp=_mk(PW,PH);
  const tc=tmp.getContext('2d');
  tc.drawImage(img,dx,dy,dw,dh);

  // Clip to the lasso polygon and draw ON TOP of the frame — no shadow, exact shape
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0].x,poly[0].y);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x,poly[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(tmp,0,0);
  ctx.restore();
}

function drawPhotoLayer(ctx){
  const areaW = MASK.x1-MASK.x4;   // 603
  const areaH = MASK.y2-MASK.y0;   // 850

  // Step 1: draw photo content onto temp canvas (full PSD size)
  const tmp = _mk(PW,PH);
  const tc = tmp.getContext('2d');

  if(CS.photoImg){
    const img=CS.photoImg;
    const iw=img.naturalWidth||200, ih=img.naturalHeight||300;
    const baseScale=Math.max(areaW/iw, areaH/ih);
    const sc=baseScale*CS.imgScale;
    const dw=iw*sc, dh=ih*sc;
    // Center photo in the mask area + user offsets
    const dx=(MASK.x4+MASK.x1)/2 - dw/2 + CS.imgOffsetX;
    const dy=(MASK.y0+MASK.y2)/2 - dh/2 + CS.imgOffsetY;
    tc.drawImage(img, dx, dy, dw, dh);
  } else {
    // Placeholder gradient
    const pg=tc.createLinearGradient(MASK.x4,MASK.y0,MASK.x1,MASK.y2);
    pg.addColorStop(0,'#1e2e70'); pg.addColorStop(1,'#0d1545');
    tc.fillStyle=pg;
    tc.fillRect(MASK.x4,MASK.y0,areaW,areaH);
    tc.globalAlpha=0.07;
    tc.font='140px serif'; tc.textAlign='center'; tc.fillStyle='#fff';
    tc.fillText('\u26BE',(MASK.x4+MASK.x1)/2,(MASK.y0+MASK.y2)/2+50);
    tc.globalAlpha=1; tc.textAlign='left';
  }

  // Step 2: clip photo to exact photo polygon using layer03 alpha as mask.
  // LAYERS.photo_mask is a white RGBA image whose alpha = layer03's alpha channel.
  // destination-in keeps photo ONLY where photo_mask has non-zero alpha
  // = exactly the photo polygon (left=60, top=47, right=663, bottom=897 with diagonal notch).
  // This prevents ANY bleed outside the frame.
  tc.globalCompositeOperation = 'destination-in';
  if(LAYERS.photo_mask) tc.drawImage(LAYERS.photo_mask, 0, 0, PW, PH);

  // Step 4: composite final result onto main canvas
  ctx.drawImage(tmp, 0, 0);
}

function drawFront(ctx){
  const par=PAR[CS.parallel]||PAR.base;
  const d=CS.data;
  const fn=(d.firstName||'').toUpperCase();
  const ln=(d.lastName||'PLAYER NAME').toUpperCase();
  const posText=(d.position||'POSITION').toUpperCase();
  const abbr=((d.team||'').substring(0,3)||'LYB').toUpperCase();

  // ── LAYER 01: Background ──
  if(LAYERS.bg) ctx.drawImage(LAYERS.bg,0,0,PW,PH);

  // ── Parallel tint ──
  if(par.tint){
    const[r,g,b,a]=par.tint;
    ctx.fillStyle=`rgba(${r},${g},${b},${a})`;
    ctx.fillRect(0,0,PW,PH);
  }
  if(par.name==='RAINBOW FOIL') drawRainbow(ctx);
  if(par.name==='HOLO FOIL')    drawHolo(ctx);
  if(par.name==='OPENING DAY')  drawOpeningDayBg(ctx);

  // ── LAYER 02: LYBS banner (toggle) ──
  if(CS.showBanner && LAYERS.banner) ctx.drawImage(LAYERS.banner,0,0,PW,PH);

  // ── LAYER 03: PHOTO — clipped to exact mask shape ──
  drawPhotoLayer(ctx);

  // ── LAYER 04: Player frame (white border, stitch dots, blue bar) ──
  if(LAYERS.frame) ctx.drawImage(LAYERS.frame,0,0,PW,PH);

  // ── Recolor the accent bar (behind position) to chosen color ──
  if(CS.accentColor && CS.accentColor.toLowerCase()!=='#1546a0' || (CS.accentSat!==undefined && CS.accentSat!==100)){
    drawAccentBar(ctx);
  }

  // ── LAYER 05: Inner shadow — ON TOP of photo, UNDER frame ──
  // This is the vignette/shadow that overlays the photo edges inside the frame
  if(LAYERS.shadow){
    ctx.save();
    photoMaskPath(ctx);
    ctx.clip();
    ctx.drawImage(LAYERS.shadow,0,0,PW,PH);
    ctx.restore();
  }

  // ── 3D BREAKOUT: player pokes above the top frame ──
  if(CS.breakout && CS.photoImg) drawBreakout(ctx);

  // ── LAYER 06: Logo circle chrome ──
  if(LAYERS.logo) ctx.drawImage(LAYERS.logo,0,0,PW,PH);
  if(CS.logoImg){
    const lcx=163, lcy=891, lr=72;
    ctx.save();
    ctx.beginPath(); ctx.arc(lcx,lcy,lr,0,Math.PI*2);
    ctx.fillStyle='#ffffff'; ctx.fill();
    ctx.clip();
    const li=CS.logoImg;
    const iw=li.naturalWidth||100, ih=li.naturalHeight||100;
    const baseScL=Math.max((lr*2)/iw,(lr*2)/ih);
    const scL=baseScL*CS.logoScale;
    ctx.drawImage(li,lcx-(iw*scL)/2+CS.logoOffsetX,lcy-(ih*scL)/2+CS.logoOffsetY,iw*scL,ih*scL);
    ctx.restore();
  }

  // ── LAYER 07: POSITION — Michroma italic, all caps, drop shadow ──
  ctx.save();
  let pfs=24;
  ctx.font=`italic ${pfs}px Michroma,sans-serif`;
  while(ctx.measureText(posText).width>POS_MAXW&&pfs>11){pfs--;ctx.font=`italic ${pfs}px Michroma,sans-serif`;}
  ctx.textAlign='left'; ctx.lineJoin='round';
  // Dark drop shadow layers
  ctx.shadowColor='rgba(0,0,0,0.5)';
  ctx.shadowBlur=4;
  ctx.shadowOffsetX=1;
  ctx.shadowOffsetY=1;
  ctx.fillStyle='rgba(235,235,240,0.92)';
  ctx.fillText(posText,POS_X,POS_Y);
  ctx.shadowColor='transparent';
  ctx.shadowBlur=0;
  ctx.shadowOffsetX=0;
  ctx.shadowOffsetY=0;
  ctx.restore();

  // ── LAYER 08: PLAYER NAME — Anton (Hackensack-style), bold italic, all caps ──
  // One line when it fits at a readable size. A long name goes on two lines (first name smaller,
  // with room above the last name), and no name ever runs past the frame. See nameLayout().
  ctx.save();
  ctx.textAlign='left'; ctx.lineJoin='round';
  // Soft drop shadow — single offset, light opacity
  ctx.shadowColor='rgba(0,0,0,0.65)';
  ctx.shadowBlur=6;
  ctx.shadowOffsetX=2;
  ctx.shadowOffsetY=2;
  ctx.fillStyle='#ffffff';
  nameLayout(ctx,fn,ln).forEach(L=>{
    ctx.font=`italic ${L.size}px Anton,sans-serif`;
    ctx.save(); ctx.translate(NAME_X,L.y); ctx.scale(L.squeeze,1);
    ctx.fillText(L.text,0,0);
    ctx.restore();
  });
  // Reset shadow
  ctx.shadowColor='transparent';
  ctx.shadowBlur=0;
  ctx.shadowOffsetX=0;
  ctx.shadowOffsetY=0;
  ctx.restore();

  // ── SIGNATURE BOX (auto parallel) ──
  if(CS.parallel==='auto') drawAutoBox(ctx);

  // ── LAYER 09: Corner badge (mac or custom) ──
  if(CS.macImg){ ctx.save();ctx.drawImage(CS.macImg,565,47,85,91);ctx.restore(); } else if(LAYERS.mac) ctx.drawImage(LAYERS.mac,0,0,PW,PH);

  // ── GOLD NUMBERED embossment ──
  if(par.name==='GOLD NUMBERED') drawGoldEmbossment(ctx);

  // ── GLOSS ──
  drawGloss(ctx,par);

  // ── CRACKED ICE full-card prismatic overlay (after everything) ──
  if(par.name==='CRACKED ICE') drawIceOverlay(ctx);
  // ── BUBBLE PRIZM full-card shimmer ──
  if(par.name==='BUBBLE PRIZM') drawBubbleOverlay(ctx);
}

/* ── Rainbow ── */
function drawRainbow(ctx){
  const mx=CS.mx,my=CS.my,off=mx*300+my*150;
  const rg=ctx.createLinearGradient(off,0,off+PW*1.2,PH);
  rg.addColorStop(0,'rgba(255,0,80,0.38)');rg.addColorStop(.14,'rgba(255,120,0,0.35)');
  rg.addColorStop(.28,'rgba(255,220,0,0.32)');rg.addColorStop(.42,'rgba(0,220,80,0.35)');
  rg.addColorStop(.57,'rgba(0,120,255,0.38)');rg.addColorStop(.71,'rgba(120,0,255,0.35)');
  rg.addColorStop(.85,'rgba(255,0,180,0.35)');rg.addColorStop(1,'rgba(255,0,80,0.38)');
  ctx.fillStyle=rg;ctx.fillRect(0,0,PW,PH);
}
/* ── Holo ── */
function drawHolo(ctx){
  const mx=CS.mx,my=CS.my,sz=8;
  for(let y=0;y<PH;y+=sz){for(let x=0;x<PW;x+=sz){
    const dist=Math.sqrt(((x/PW)-mx)**2+((y/PH)-my)**2);
    const hue=((x+y)*1.6+mx*180+my*120)%360;
    const alpha=0.07+0.11*(1-Math.min(dist*2,1));
    ctx.fillStyle=`hsla(${hue},100%,60%,${alpha})`;
    ctx.fillRect(x,y,sz-1,sz-1);
  }}
}
/* ── Recolor accent bar region ── */
function drawAccentBar(ctx){
  const hex=(CS.accentColor||'#1546a0').replace('#','');
  let r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);
  const sat=(CS.accentSat==null?100:CS.accentSat)/100;
  const avg=(r+g+b)/3;
  r=Math.max(0,Math.min(255,avg+(r-avg)*sat));
  g=Math.max(0,Math.min(255,avg+(g-avg)*sat));
  b=Math.max(0,Math.min(255,avg+(b-avg)*sat));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(305,919);ctx.lineTo(667,919);ctx.lineTo(667,953);ctx.lineTo(279,953);ctx.closePath();
  ctx.clip();
  ctx.globalCompositeOperation='multiply';
  ctx.fillStyle=`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  ctx.fillRect(279,915,400,42);
  ctx.globalCompositeOperation='source-atop';
  const sh=ctx.createLinearGradient(279,919,667,953);
  sh.addColorStop(0,'rgba(255,255,255,0.25)');sh.addColorStop(0.5,'rgba(255,255,255,0)');
  sh.addColorStop(1,'rgba(0,0,0,0.15)');
  ctx.fillStyle=sh;ctx.fillRect(279,915,400,42);
  ctx.restore();
}
/* ── Gloss ── */
function drawGloss(ctx,par){
  // Derive light pos from physical card tilt angle
  const mx=0.5+CS.rotY/28*0.6, my=0.5-CS.rotX/20*0.6;
  const sx=mx*PW, sy=my*PH;
  const gl=ctx.createLinearGradient(sx*.5,sy*.1,PW,PH);
  gl.addColorStop(0,'rgba(255,255,255,0.13)');gl.addColorStop(.4,'rgba(255,255,255,0.03)');gl.addColorStop(1,'rgba(0,0,0,0.04)');
  ctx.fillStyle=gl;ctx.fillRect(0,0,PW,PH);
  // (specular spotlight removed)
  const ev=ctx.createRadialGradient(PW/2,PH/2,PH*.3,PW/2,PH/2,PH*.75);
  ev.addColorStop(0,'rgba(0,0,0,0)');ev.addColorStop(1,'rgba(0,0,0,0.2)');
  ctx.fillStyle=ev;ctx.fillRect(0,0,PW,PH);
  if(['RAINBOW FOIL','HOLO FOIL'].includes(par.name)){
    const ang=mx*.6-.2,bx2=Math.cos(ang),by2=Math.sin(ang);
    const pb=ctx.createLinearGradient(sx-bx2*250,sy-by2*250,sx+bx2*250,sy+by2*250);
    pb.addColorStop(0,'rgba(255,255,255,0)');pb.addColorStop(.46,'rgba(255,255,255,0)');
    pb.addColorStop(.49,'rgba(255,255,255,0.22)');pb.addColorStop(.50,'rgba(255,255,255,0.40)');
    pb.addColorStop(.51,'rgba(255,255,255,0.22)');pb.addColorStop(.54,'rgba(255,255,255,0)');
    pb.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=pb;ctx.fillRect(0,0,PW,PH);
  }
}

/* ── Card back ── portrait, mirrors front sidebar, clean Topps layout ── */
function drawBack(ctx){
  const d=CS.data, par=PAR[CS.parallel]||PAR.base;
  const fn=(d.firstName||'').toUpperCase(), ln=(d.lastName||'PLAYER').toUpperCase();
  const fullName=fn?fn+' '+ln:ln;
  const abbr=((d.team||'LYBS').substring(0,3)).toUpperCase();
  const g=par.glow; const [pr,pg,pb]=g?g:[80,110,200];

  // ── Rotate canvas 90° → landscape drawing space is 1000×712 ──
  ctx.save();
  ctx.translate(PW,0);
  ctx.rotate(Math.PI/2);
  const LW=PH,LH=PW; // 1000×712

  // ══ BACKGROUND: woven texture (same as front) ══
  ctx.fillStyle='#d2cec6'; ctx.fillRect(0,0,LW,LH);
  if(LAYERS.bg){
    try{ctx.globalAlpha=0.85;ctx.drawImage(LAYERS.bg,0,0,LW,LH);ctx.globalAlpha=1;}catch(e){}
  }
  // Knit rows
  for(let y=0;y<LH;y+=3){
    ctx.fillStyle=y%6===0?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.04)';
    ctx.fillRect(0,y,LW,2);
  }
  // White overlay L→R (same as front bg)
  const wo=ctx.createLinearGradient(0,0,LW,0);
  wo.addColorStop(0,'rgba(255,255,255,0)');
  wo.addColorStop(0.4,'rgba(255,255,255,0.2)');
  wo.addColorStop(1,'rgba(255,255,255,0.7)');
  ctx.fillStyle=wo;ctx.fillRect(0,0,LW,LH);

  // ══ SIDEBARS: top & bottom strips (match front banner style) ══
  const SH=52;
  // Dark woven sidebar base
  ctx.fillStyle='#1e2028';ctx.fillRect(0,0,LW,SH);
  ctx.fillStyle='#1e2028';ctx.fillRect(0,LH-SH,LW,SH);
  // Knit texture on strips
  for(let x=0;x<LW;x+=4){
    ctx.fillStyle='rgba(255,255,255,0.03)';
    ctx.fillRect(x,0,1,SH); ctx.fillRect(x,LH-SH,1,SH);
  }
  // Blue accent lines
  ctx.fillStyle=`rgba(${pr},${pg},${pb},0.7)`;
  ctx.fillRect(0,8,LW,3); ctx.fillRect(0,SH-11,LW,3);
  ctx.fillRect(0,LH-SH+8,LW,3); ctx.fillRect(0,LH-11,LW,3);
  // White divider
  ctx.fillStyle='rgba(255,255,255,0.18)';
  ctx.fillRect(0,SH-1,LW,1); ctx.fillRect(0,LH-SH,LW,1);
  // X-stitch
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=0.9;
  for(let x=12;x<LW-12;x+=14){
    [SH-20, LH-SH+20].forEach(cy=>{
      ctx.beginPath();ctx.moveTo(x-2.5,cy-2.5);ctx.lineTo(x+2.5,cy+2.5);
      ctx.moveTo(x+2.5,cy-2.5);ctx.lineTo(x-2.5,cy+2.5);ctx.stroke();
    });
  }

  // ══ INNER FRAME ══
  const FX=16,FY=SH+6,FW=LW-32,FH=LH-SH*2-12,FR=6;
  // Shadow
  ctx.save();ctx.shadowColor='rgba(0,0,0,0.2)';ctx.shadowBlur=6;
  rr2(ctx,FX,FY,FW,FH,FR);ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=2;ctx.stroke();
  ctx.restore();
  // White-grey gradient frame
  const ff=ctx.createLinearGradient(FX,FY,FX+FW,FY+FH);
  ff.addColorStop(0,'rgba(255,255,255,0.92)');ff.addColorStop(.5,'rgba(245,245,250,0.78)');
  ff.addColorStop(1,'rgba(195,195,210,0.55)');
  rr2(ctx,FX,FY,FW,FH,FR);ctx.strokeStyle=ff;ctx.lineWidth=1.5;ctx.stroke();
  // Inner hairline
  rr2(ctx,FX+2,FY+2,FW-4,FH-4,FR-1);
  ctx.strokeStyle='rgba(0,0,0,0.05)';ctx.lineWidth=0.5;ctx.stroke();
  // Stitch dots on top inner border
  for(let sx2=FX+16;sx2<FX+FW-10;sx2+=10){
    ctx.beginPath();ctx.arc(sx2,FY+4,1.8,0,Math.PI*2);
    ctx.fillStyle='rgba(155,160,178,0.55)';ctx.fill();
  }

  // ══ HEADER: card# | name banner | team logo ══
  const CY=FY+12, CX2=FX+12, CW2=FW-24;
  const HDR_H=44;

  // Card number
  ctx.font='bold 24px Oswald,sans-serif';ctx.fillStyle='#1a1a1a';
  ctx.fillText('#'+(d.cardNum||'—'),CX2,CY+HDR_H-10);

  // Name banner (center)
  const nbW=Math.min(380,CW2-200), nbH=HDR_H, nbX=CX2+72+(CW2-200-nbW)/2, nbY=CY;
  const nb=ctx.createLinearGradient(nbX,nbY,nbX+nbW,nbY+nbH);
  nb.addColorStop(0,`rgba(${Math.min(pr+50,255)},${Math.min(pg+70,255)},${Math.min(pb+90,255)},0.95)`);
  nb.addColorStop(.45,`rgba(${pr},${pg},${pb},0.92)`);
  nb.addColorStop(1,`rgba(${Math.floor(pr*.55)},${Math.floor(pg*.6)},${Math.floor(pb*.7)},0.95)`);
  rr2(ctx,nbX,nbY,nbW,nbH,4);ctx.fillStyle=nb;ctx.fill();
  for(let i=0;i<nbH;i+=2){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(nbX,nbY+i,nbW,1);}
  ctx.fillStyle='rgba(255,255,255,0.22)';ctx.fillRect(nbX,nbY,nbW,1);
  let nfs=22;ctx.font=`italic ${nfs}px Anton,sans-serif`;
  while(ctx.measureText(fullName).width>nbW-20&&nfs>12){nfs--;ctx.font=`italic ${nfs}px Anton,sans-serif`;}
  ctx.textAlign='center';
  ctx.strokeStyle='rgba(0,0,0,0.8)';ctx.lineWidth=5;ctx.lineJoin='round';
  ctx.strokeText(fullName,nbX+nbW/2,nbY+nbH-9);
  ctx.fillStyle='#fff';ctx.fillText(fullName,nbX+nbW/2,nbY+nbH-9);
  ctx.textAlign='left';

  // Team logo — top right (use front logo style)
  const lrx=FX+FW-72, lry=CY, lrR=36;
  if(CS.logoImg){
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.4)';ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(lrx+lrR,lry+lrR,lrR,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(lrx+lrR,lry+lrR,lrR-4,0,Math.PI*2);
    ctx.strokeStyle=`rgb(${pr},${pg},${pb})`;ctx.lineWidth=3;ctx.stroke();
    ctx.clip();
    const li=CS.logoImg,iw=li.naturalWidth||100,ih=li.naturalHeight||100;
    const scL=Math.max(((lrR-4)*2)/iw,((lrR-4)*2)/ih)*CS.logoScale;
    ctx.drawImage(li,lrx+lrR-iw*scL/2+CS.logoOffsetX,lry+lrR-ih*scL/2+CS.logoOffsetY,iw*scL,ih*scL);
    ctx.restore();
  } else if(LAYERS.mac){
    ctx.drawImage(LAYERS.mac,lrx,lry,lrR*2,lrR*2);
  }

  let cy=CY+HDR_H+8;

  // ══ SUB-HEADER: series + team/position ══
  ctx.font='500 10px Oswald,sans-serif';ctx.fillStyle='#888';
  ctx.fillText('LYBS 2026 · SERIES ONE',CX2,cy+11);
  const teamPos=`${(d.team||'LYBS TEAM').toUpperCase()} · ${d.position||'POSITION'}`;
  ctx.font='italic bold 11.5px "Source Serif 4",Georgia,serif';ctx.fillStyle='#2a2a2a';
  ctx.textAlign='center';ctx.fillText(teamPos,LW/2,cy+11);ctx.textAlign='left';
  cy+=20;

  // ══ BIO ══
  ctx.font='500 9.5px Oswald,sans-serif';ctx.fillStyle='#444';
  ctx.fillText(`HT: ${d.height||'—'}   WT: ${d.weight||'—'} lbs   BATS: ${d.bats||'R'}   THROWS: ${d.throws||'R'}`,CX2,cy+10);
  cy+=14;
  ctx.fillText(`DIVISION: ${d.division||'—'}   JERSEY #${d.jerseyNum||'—'}${d.hometown?'   FROM: '+d.hometown:''}`,CX2,cy+10);
  cy+=14;

  // Divider
  ctx.strokeStyle='rgba(0,0,0,0.1)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(CX2,cy);ctx.lineTo(FX+FW-12,cy);ctx.stroke();
  cy+=6;

  // Table width spans the content area inside the frame
  const TW=FW-24;

  // ══ STAT TABLES (batting + pitching) ══
  // Each table auto-sizes columns to fill width. Cells flagged as leaders render bold+italic.
  function drawStatTable(title, headers, widths, rows, accentRGB, pulled){
    const [ar,ag,ab2]=accentRGB;
    // Title bar
    const titleH=28;
    ctx.fillStyle=`rgb(${ar},${ag},${ab2})`;ctx.fillRect(CX2,cy,TW,titleH);
    ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(CX2,cy,TW,titleH);
    ctx.fillStyle='rgba(255,255,255,0.22)';ctx.fillRect(CX2,cy,TW,1);
    ctx.font='bold 18px Oswald,sans-serif';ctx.fillStyle='#fff';ctx.textAlign='left';
    ctx.fillText(title,CX2+10,cy+20);
    if(pulled){
      ctx.font='600 9px Oswald,sans-serif';ctx.fillStyle='rgba(255,255,255,0.8)';ctx.textAlign='right';
      ctx.fillText('\u2714 STATS PULLED FROM RECORD',CX2+TW-8,cy+19);ctx.textAlign='left';
    }
    cy+=titleH;
    // Column widths to fill TW
    const totR=widths.reduce((a,b)=>a+b,0);
    const cw=widths.map(w=>Math.floor(w/totR*TW));
    cw[cw.length-1]+=TW-cw.reduce((a,b)=>a+b,0);
    // Header row
    const headH=20;
    ctx.fillStyle=`rgba(${ar},${ag},${ab2},0.16)`;ctx.fillRect(CX2,cy,TW,headH);
    ctx.strokeStyle=`rgba(${ar},${ag},${ab2},0.4)`;ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(CX2,cy+headH);ctx.lineTo(CX2+TW,cy+headH);ctx.stroke();
    ctx.font='bold 12px Oswald,sans-serif';ctx.fillStyle='#222';
    let hx=CX2;
    headers.forEach((col,i)=>{
      ctx.textAlign=i>1?'center':'left';
      ctx.fillText(col,i>1?hx+cw[i]/2:hx+3,cy+14);hx+=cw[i];
    });
    ctx.textAlign='left';cy+=headH;
    // Data rows
    const RH=22;
    rows.forEach((row,idx)=>{
      ctx.fillStyle=idx%2===0?'rgba(248,246,240,0.9)':'rgba(235,232,224,0.9)';
      ctx.fillRect(CX2,cy,TW,RH);
      let rx=CX2;
      row.forEach((cell,i)=>{
        const v=(cell&&cell.v!==undefined)?cell.v:cell;
        const lead=(cell&&cell.lead);
        ctx.font=(lead?'bold italic ':'600 ')+'13px Oswald,sans-serif';
        ctx.fillStyle=lead?`rgb(${ar},${ag},${ab2})`:'#1a1a1a';
        ctx.textAlign=i>1?'center':'left';
        ctx.fillText((v===''||v==null)?'\u2014':String(v),i>1?rx+cw[i]/2:rx+3,cy+15);
        rx+=cw[i];
      });
      ctx.textAlign='left';cy+=RH;
    });
    if(rows.length===0){
      ctx.fillStyle='rgba(248,246,240,0.85)';ctx.fillRect(CX2,cy,TW,RH);
      ctx.font='italic 12px "Source Serif 4",Georgia,serif';ctx.fillStyle='#999';
      ctx.textAlign='center';ctx.fillText('No stats recorded',CX2+TW/2,cy+15);
      ctx.textAlign='left';cy+=RH;
    }
    cy+=8;
  }

  // Build batting rows — full column set
  const bHeaders=['YR','CLUB','PA','AB','H','AVG','OBP','SLG','2B','3B','HR','BB','K','RBI','TB','SB'];
  const bWidths =[26,58,30,30,28,40,40,40,26,26,28,28,26,30,30,28];
  const battingRows=(d.stats||[]).map(s=>{
    const lead=s.leaders||{};
    const cell=(key,val)=>({v:val,lead:!!lead[key]});
    return [s.year,s.club,cell('pa',s.pa),cell('ab',s.ab),cell('h',s.h),cell('avg',s.avg),
      cell('obp',s.obp),cell('slg',s.slg),cell('d2',s['2b']||s.d2),cell('d3',s['3b']||s.d3),
      cell('hr',s.hr),cell('bb',s.bb),cell('k',s.k||s.so),cell('rbi',s.rbi),cell('tb',s.tb),cell('sb',s.sb)];
  });
  drawStatTable('BATTING',bHeaders,bWidths,battingRows,[pr,pg,pb],d.statsPulled);

  // Build pitching rows — core + FIP
  if((d.pitchStats||[]).length){
    const pHeaders=['YR','CLUB','IP','GP','GS','W','L','SV','ERA','WHIP','SO','BB','H','R','ER','FIP','BAA'];
    const pWidths =[24,52,32,26,26,24,24,26,38,40,30,28,28,26,28,34,40];
    const pitchingRows=(d.pitchStats||[]).map(s=>{
      const lead=s.leaders||{};
      const cell=(key,val)=>({v:val,lead:!!lead[key]});
      return [s.year,s.club,cell('ip',s.ip),cell('gp',s.gp),cell('gs',s.gs),cell('w',s.w),
        cell('l',s.l),cell('sv',s.sv),cell('era',s.era),cell('whip',s.whip),cell('so',s.so),
        cell('bb',s.bb),cell('h',s.h),cell('r',s.r),cell('er',s.er),cell('fip',s.fip),cell('baa',s.baa)];
    });
    drawStatTable('PITCHING',pHeaders,pWidths,pitchingRows,
      [Math.floor(pr*0.7),Math.floor(pg*0.7),Math.floor(pb*0.85)],d.pitchPulled);
  }

  // ══ PLAYER BLURB ══
  const blurbY=cy, blurbW=TW, blurbH=44;
  if(cy+blurbH<FY+FH-40){
    ctx.font='italic 9.5px "Source Serif 4",Georgia,serif';ctx.fillStyle='#333';
    const blurb=`${fn} ${ln} plays ${d.position||'for'} ${d.team||'LYBS'}. Division: ${d.division||'—'}. Jersey #${d.jerseyNum||'—'}. ${d.hometown?'Hometown: '+d.hometown+'.':''}`;
    // Simple word wrap
    const words=blurb.split(' ');let line='',lineY=cy+12;
    words.forEach(w=>{
      const test=line+w+' ';
      if(ctx.measureText(test).width>TW-4&&line){
        ctx.fillText(line.trim(),CX2,lineY);line=w+' ';lineY+=13;
      } else line=test;
    });
    if(line) ctx.fillText(line.trim(),CX2,lineY);
    cy=lineY+16;
  }

  // ══ SIG BOX ON BACK (auto) ══
  if(CS.parallel==='auto'&&CS.sigImg&&cy+45<FY+FH-24){
    ctx.fillStyle='rgba(255,255,255,0.94)';rr2(ctx,CX2,cy,TW,42,3);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.1)';ctx.lineWidth=0.5;ctx.stroke();
    const si=CS.sigImg,sc2=Math.min((TW-10)/(si.naturalWidth||100),(42-10)/(si.naturalHeight||50));
    ctx.drawImage(si,CX2+5+(TW-10-(si.naturalWidth||100)*sc2)/2,cy+5,
      (si.naturalWidth||100)*sc2,(si.naturalHeight||50)*sc2);
    cy+=48;
  }

  // ══ FOOTER ══
  const footY=FY+FH-26;
  ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(CX2,footY-4);ctx.lineTo(FX+FW-12,footY-4);ctx.stroke();
  // Parallel badge
  if(g){ctx.font='bold 9px Michroma,sans-serif';ctx.fillStyle=`rgb(${g[0]},${g[1]},${g[2]})`;
    ctx.fillText(par.name,CX2,footY+10);}
  ctx.font='400 7px Oswald,sans-serif';ctx.fillStyle='#aaa';
  ctx.textAlign='center';
  ctx.fillText('® & © 2026 LYBS CARD SERIES · OFFICIAL VIRTUAL TRADING CARD · SERIES ONE',LW/2,footY+20);
  ctx.textAlign='left';

  // Laminate gloss
  const gl=ctx.createLinearGradient(0,0,LW,LH);
  gl.addColorStop(0,'rgba(255,255,255,0.1)');gl.addColorStop(1,'rgba(0,0,0,0.04)');
  ctx.fillStyle=gl;ctx.fillRect(0,0,LW,LH);

  ctx.restore(); // end 90° rotation
}


function rr2(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

/* ── drawAutoBox ── */
function drawAutoBox(ctx){
  if(!CS.sigImg) return;
  // Signature box positioned in lower photo area, above the nameplate
  const bx=MASK.x4+8, by=MASK.y2-232, bw=(MASK.x1-MASK.x4)-16, bh=130;
  ctx.fillStyle='rgba(255,255,255,0.94)';
  rr2(ctx,bx,by,bw,bh,4);ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.5;ctx.stroke();
  const si=CS.sigImg;
  const sc=Math.min((bw-12)/(si.naturalWidth||100),(bh-12)/(si.naturalHeight||50));
  const sw=(si.naturalWidth||100)*sc, sh=(si.naturalHeight||50)*sc;
  ctx.drawImage(si,bx+6+(bw-12-sw)/2,by+6+(bh-12-sh)/2,sw,sh);
  ctx.font='500 7px Oswald,sans-serif';ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.textAlign='right';
  ctx.fillText('LYBS CERTIFIED AUTOGRAPH ISSUE',MASK.x1-6,by-4);
  ctx.textAlign='left';
}

function drawGoldEmbossment(ctx){
  const serial=parseInt(CS.serialNum)||1;
  const total =parseInt(CS.printRun)||50;
  const isVert=(CS.serialPos==='v');
  const padded=String(serial).padStart(String(total).length,'0');
  const text=padded+'/'+total;
  const fs=42;            // bigger / taller
  const xScale=0.62;      // squeeze horizontally → skinny digits
  const lx=CS.rotY/14, ly=-CS.rotX/10;

  ctx.save();
  ctx.font=`${fs}px "Courier New",Courier,monospace`;  // not bold → thinner strokes
  ctx.textBaseline='alphabetic';

  const ox=78, oy=150;
  ctx.translate(ox,oy);
  if(isVert) ctx.rotate(Math.PI/2);
  ctx.scale(xScale,1);    // tall + narrow

  // Emboss light vectors (in pre-scale space, so divide x by xScale to keep even)
  const lightX=(-1.4 - lx*1.6)/xScale;
  const lightY=-1.4 + ly*1.6;
  const darkX =( 1.4 + lx*1.6)/xScale;
  const darkY = 1.4 - ly*1.6;

  let xCursor=0;
  const letterSpace=3/xScale;  // a little air between wheels
  text.split('').forEach((ch,i)=>{
    // subtle per-character wheel misalignment (±1.2px)
    const jitter=Math.sin(i*12.9+serial*0.37)*1.2;
    const cy=jitter;
    const cw=ctx.measureText(ch).width;

    // 1. Recessed dark edge (lower-right)
    ctx.fillStyle='rgba(55,38,0,0.6)';
    ctx.fillText(ch, xCursor+darkX, cy+darkY);
    // 2. Raised bright edge (upper-left)
    ctx.fillStyle='rgba(255,250,205,0.7)';
    ctx.fillText(ch, xCursor+lightX, cy+lightY);
    // 3. Gold foil face
    const gold=ctx.createLinearGradient(0,-fs+ly*10,0,4-ly*10);
    gold.addColorStop(0,   `rgba(255,246,165,${0.9+Math.abs(lx)*0.1})`);
    gold.addColorStop(0.30,'#f2c531');
    gold.addColorStop(0.58,'#cf9015');
    gold.addColorStop(0.80,'#a86c08');
    gold.addColorStop(1,   '#7d4f00');
    ctx.fillStyle=gold;
    ctx.fillText(ch, xCursor, cy);
    // 4. Specular foil flash (tilt-reactive)
    const sp=Math.min(Math.abs(lx)*0.65+Math.abs(ly)*0.35, 0.75);
    if(sp>0.05){
      ctx.fillStyle=`rgba(255,255,238,${sp})`;
      ctx.fillText(ch, xCursor-lx*2, cy-Math.abs(ly)*1.4);
    }
    xCursor+=cw+letterSpace;
  });
  ctx.restore();
}

/* ── Cracked Ice overlay — independent zone shimmer ── */

/* ── Cracked Ice — prismatic triangle facets ──
   Seeded jittered grid → irregular triangles, each with
   unique phase/hue. Screen-blend as tilt aligns with phase. ── */
let _ICE_FACETS=null;
function _buildIceFacets(){
  let s=31415;
  function r(){s=(s*1664525+1013904223)>>>0;return(s>>>0)/4294967295;}
  const COLS=11,ROWS=16,facets=[];
  const gw=PW/COLS,gh=PH/ROWS;
  // Jittered grid points
  const pts=[];
  for(let row=-1;row<=ROWS+1;row++) for(let col=-1;col<=COLS+1;col++)
    pts.push({x:col*gw+(r()-.5)*gw*.75,y:row*gh+(r()-.5)*gh*.75});
  const pc=COLS+3;
  for(let row=0;row<ROWS+1;row++) for(let col=0;col<COLS+1;col++){
    const i=row*pc+col;
    const tl=pts[i],tr=pts[i+1],bl=pts[i+pc],br=pts[i+pc+1];
    if(!tl||!tr||!bl||!br) continue;
    [
      [tl,tr,bl],
      [tr,br,bl]
    ].forEach(verts=>{
      facets.push({
        verts,
        phase:r()*360,
        hue:r()*360,
        sat:88+r()*12,
        peak:0.45+r()*0.55,
        bw:12+r()*32
      });
    });
  }
  return facets;
}

/* ── Bubble Prizm — overlapping circles that shimmer per tilt ── */
let _BUBBLES=null;
function _buildBubbles(){
  let s=8675309;
  function r(){s=(s*1664525+1013904223)>>>0;return(s>>>0)/4294967295;}
  const arr=[];
  // Multiple layers of circles at different sizes
  const counts=[[28,90],[44,55],[70,32]]; // [count, radius]
  counts.forEach(([n,rad])=>{
    for(let i=0;i<n;i++){
      arr.push({x:r()*PW,y:r()*PH,rad:rad*(0.6+r()*0.8),phase:r()*360,hue:r()*360,baseA:0.04+r()*0.06});
    }
  });
  return arr;
}
function drawBubbleOverlay(ctx){
  if(!_BUBBLES) _BUBBLES=_buildBubbles();
  const ry=CS.rotY||0,rx=CS.rotX||0;
  const tilt=Math.min(Math.sqrt((ry/14)**2+(rx/10)**2),1);
  const tiltDir=((Math.atan2(rx,ry)*180/Math.PI)+360)%360;
  ctx.save();
  ctx.globalCompositeOperation='screen';
  _BUBBLES.forEach(b=>{
    // How aligned is tilt with this bubble's phase
    const diff=((tiltDir-b.phase+540)%360)-180;
    const align=Math.exp(-(diff*diff)/(60*60));
    const a=b.baseA + align*tilt*0.4;
    const hue=(b.hue+tiltDir*1.4)%360;
    const grad=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.rad);
    grad.addColorStop(0,`hsla(${hue},100%,75%,${a})`);
    grad.addColorStop(0.6,`hsla(${(hue+40)%360},100%,70%,${a*0.5})`);
    grad.addColorStop(1,'hsla(0,0%,100%,0)');
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.arc(b.x,b.y,b.rad,0,Math.PI*2);ctx.fill();
  });
  // Faint always-on iridescent sheen
  ctx.globalAlpha=0.06;
  ctx.globalCompositeOperation='overlay';
  const sheen=ctx.createLinearGradient(0,0,PW,PH);
  sheen.addColorStop(0,'#a0d0ff');sheen.addColorStop(0.5,'#ffd0f0');sheen.addColorStop(1,'#d0ffe0');
  ctx.fillStyle=sheen;ctx.fillRect(0,0,PW,PH);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.restore();
}

/* ── Opening Day background — repeating text pattern behind player ── */
function drawOpeningDayBg(ctx){
  ctx.save();
  // Color wash gradient (steel blue → red, like the reference)
  const g=ctx.createLinearGradient(0,0,0,PH);
  g.addColorStop(0,'rgba(120,150,190,0.55)');
  g.addColorStop(0.5,'rgba(180,190,200,0.4)');
  g.addColorStop(1,'rgba(190,60,60,0.5)');
  ctx.fillStyle=g;ctx.fillRect(0,0,PW,PH);
  // Repeating "OPENING DAY 2026" diagonal text
  ctx.globalAlpha=0.18;
  ctx.fillStyle='#1a2a4a';
  ctx.font='bold 26px Anton,sans-serif';
  ctx.save();
  ctx.translate(0,0);
  const txt='OPENING DAY  2026   ';
  for(let row=0;row<14;row++){
    const y=40+row*72;
    ctx.fillText((txt+txt).substring((row*5)%txt.length),20,y);
  }
  ctx.restore();
  ctx.globalAlpha=1;
  ctx.restore();
}

function drawIceOverlay(ctx){
  if(!_ICE_FACETS) _ICE_FACETS=_buildIceFacets();
  ctx.save();
  const ry=CS.rotY||0,rx=CS.rotX||0;
  const tilt=Math.min(Math.sqrt((ry/14)**2+(rx/10)**2),1);
  const tiltDir=((Math.atan2(rx,ry)*180/Math.PI)+360)%360;

  if(tilt<0.03){ctx.restore();return;}

  // ── Prismatic facets — light up when tilt aligns with phase ──
  ctx.globalCompositeOperation='screen';
  _ICE_FACETS.forEach(f=>{
    const diff=((tiltDir-f.phase+540)%360)-180;  // -180..180
    const cf=Math.exp(-(diff*diff)/(f.bw*f.bw))*tilt*f.peak;
    if(cf<0.015) return;
    // Hue shifts with tilt direction so colors change as card rotates
    const hue=(f.hue+tiltDir*1.2+360)%360;
    ctx.globalAlpha=cf;
    ctx.fillStyle=`hsl(${hue},${f.sat}%,68%)`;
    ctx.beginPath();
    ctx.moveTo(f.verts[0].x,f.verts[0].y);
    f.verts.slice(1).forEach(v=>ctx.lineTo(v.x,v.y));
    ctx.closePath(); ctx.fill();
    // Bright edge on each lit facet
    ctx.globalAlpha=cf*0.4;
    ctx.strokeStyle=`hsl(${hue},100%,88%)`;
    ctx.lineWidth=0.6;
    ctx.stroke();
  });

  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  ctx.restore();
}


/* ── Wrapper ── */
let _loading = null;
function loadLayers(base) {
  if (_loading) return _loading;
  base = (base || '').replace(/\/?$/, '/');
  _loading = Promise.all(Object.keys(LAYER_FILES).map(k => new Promise(ok => {
    const img = new Image();
    img.onload = () => { LAYERS[k] = img; ok(); };
    img.onerror = () => ok();             // a missing layer just isn't drawn, like the builder
    img.src = base + 'layers/' + LAYER_FILES[k];
  })));
  return _loading;
}
function setLayers(map) { Object.assign(LAYERS, map); }
function setCanvasFactory(fn) { _mk = fn; }

// Card fields the renderer reads. Only these: height, weight and hometown stay blank on purpose.
function toCardData(d) {
  d = d || {};
  return {
    firstName: d.first || '', lastName: d.last || '', position: (d.positions || []).join('/') || d.position || '',
    team: d.team || '', jerseyNum: d.number || '', cardNum: d.cardNo || '', division: d.division || '',
    bats: (d.batsThrows || '').split('/')[0] || '', throws: (d.batsThrows || '').split('/')[1] || '',
    height: '', weight: '', hometown: '',
    stats: d.stats || [], pitchStats: d.pitchStats || [], statsPulled: !!d.statsPulled, pitchPulled: !!d.pitchPulled
  };
}

function render(canvas, opts) {
  opts = opts || {};
  CS = Object.assign({}, DEFAULTS, opts, { data: toCardData(opts.data), photoImg: opts.photo || null });
  if (!PAR[CS.parallel]) CS.parallel = 'base';
  canvas.width = PW; canvas.height = PH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, PW, PH);
  if (opts.side === 'back') drawBack(ctx); else drawFront(ctx);
  return canvas;
}
function photoBox() { return { x: MASK.x4, y: MASK.y0, w: MASK.x1 - MASK.x4, h: MASK.y2 - MASK.y0 }; }

return { PW, PH, PAR, MASK, LAYER_FILES, loadLayers, setLayers, setCanvasFactory, render, photoBox, toCardData,
  _test: { nameLayout, NAME_MAXW, NAME_Y } };
});
