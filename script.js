const audio = document.querySelector('#audio');
const canvas = document.querySelector('#sky');
const ctx = canvas.getContext('2d');
const playButton = document.querySelector('#playButton');
const playIcon = document.querySelector('#playIcon');
const seek = document.querySelector('#seek');
const elapsed = document.querySelector('#elapsed');
const duration = document.querySelector('#duration');
const intro = document.querySelector('#intro');
const currentWord = document.querySelector('#currentWord');
const editor = document.querySelector('#editor');

const STORAGE_KEY = 'reflections-constellation-timings-v1';
let words = loadWords();
let stars = [];
let ambient = [];
let lastActive = -1;
let width = 0, height = 0, dpr = 1;

function loadWords(){
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initial = Array.isArray(window.DEFAULT_WORDS) ? window.DEFAULT_WORDS : [];
    return JSON.parse(saved || JSON.stringify(initial)).sort((a,b)=>a.time-b.time);
  } catch {
    return Array.isArray(window.DEFAULT_WORDS) ? [...window.DEFAULT_WORDS].sort((a,b)=>a.time-b.time) : [];
  }
}
function saveWords(){
  words.sort((a,b)=>a.time-b.time);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  renderWordList();
}
function formatTime(value){
  if(!Number.isFinite(value)) return '00:00';
  const m = Math.floor(value/60), s = Math.floor(value%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function resize(){
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width; height = rect.height;
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ambient = Array.from({length:Math.max(90,Math.floor(width*height/5200))},()=>({
    x:Math.random()*width,y:Math.random()*height,r:Math.random()*1.05+.2,a:Math.random()*.45+.08,phase:Math.random()*6.28
  }));
  layoutStars();
}
function mulberry32(seed){
  return function(){
    seed|=0;seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
// Sterne liegen weit auseinander auf einer grossen "Himmelskarte".
// Die Kamera folgt dem aktuellen Stern, deshalb ist viel Platz zwischen den Sternen.
let unit = 1;
const cam = {x:0,y:0};
let lastFrame = 0;
function layoutStars(){
  unit = Math.min(1.25, Math.max(.75, Math.min(width,height)/560));
  const rand = mulberry32(1987);
  const stepMin = 90*unit, stepMax = 135*unit, minDist = 70*unit;
  const placed = [];
  let angle = rand()*Math.PI*2;
  words.forEach((item,i)=>{
    let x=0,y=0;
    if(i>0){
      const prev = placed[i-1];
      let best=null;
      for(let k=0;k<40;k++){
        const a = angle + (rand()-.5)*2.4;
        const d = stepMin + rand()*(stepMax-stepMin);
        const cx = prev.x+Math.cos(a)*d, cy = prev.y+Math.sin(a)*d*.85;
        let nearest = Infinity;
        for(let j=0;j<i;j++){
          const dd = Math.hypot(placed[j].x-cx, placed[j].y-cy);
          if(dd<nearest) nearest=dd;
        }
        let score = Math.min(nearest,170*unit) - Math.hypot(cx,cy)*.04;
        if(nearest<minDist) score -= 1000;
        if(!best || score>best.score) best={x:cx,y:cy,a,score};
      }
      x=best.x; y=best.y; angle=best.a;
    }
    placed.push({x,y});
  });
  stars = placed.map((p,i)=>{
    // Label auf der Seite, die vom Linienverlauf wegzeigt
    const prev = placed[Math.max(0,i-1)];
    let dx = p.x-prev.x, dy = p.y-prev.y;
    const len = Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    let nx = -dy, ny = dx;
    if(ny>0){nx=-nx;ny=-ny;}
    const align = Math.abs(nx)<.35 ? 'center' : (nx>0 ? 'left' : 'right');
    return {x:p.x,y:p.y,item:words[i],nx,ny,align};
  });
  const start = stars[0];
  cam.x = start?start.x:0; cam.y = start?start.y:0;
}
const LABEL_IN = .35, LABEL_HOLD = 2.6, LABEL_OUT = 1.2;
function labelAlpha(age,special){
  const hold = special ? LABEL_HOLD+1.8 : LABEL_HOLD;
  if(age<0) return 0;
  if(age<LABEL_IN) return age/LABEL_IN;
  if(age<hold) return 1;
  if(age<hold+LABEL_OUT) return 1-(age-hold)/LABEL_OUT;
  return 0;
}
function draw(now=0){
  const dt = Math.min(.1,(now-lastFrame)/1000||0); lastFrame = now;
  const t = audio.currentTime;
  ctx.clearRect(0,0,width,height);

  let activeIndex=-1;
  for(let i=0;i<words.length;i++){ if(words[i].time<=t) activeIndex=i; else break; }

  // Kamera sanft zum aktuellen Stern bewegen
  const target = stars[Math.max(0,activeIndex)];
  if(target){
    const k = 1-Math.pow(.25,dt*2);
    cam.x += (target.x-cam.x)*k; cam.y += (target.y-cam.y)*k;
  }
  const ox = width/2-cam.x, oy = height/2-cam.y;

  // Hintergrundsterne mit leichtem Parallax-Effekt
  ambient.forEach(p=>{
    const twinkle=.72+.28*Math.sin(now*.0008+p.phase);
    const px=(((p.x-cam.x*.12)%width)+width)%width;
    const py=(((p.y-cam.y*.12)%height)+height)%height;
    ctx.beginPath();ctx.arc(px,py,p.r,0,Math.PI*2);
    ctx.fillStyle=`rgba(225,232,255,${p.a*twinkle})`;ctx.fill();
  });

  const visible = stars.slice(0,activeIndex+1);
  const ageOf = s => t-s.item.time;
  const starAlpha = s => { const a=ageOf(s); return a<20?1:Math.max(.4,1-(a-20)/40); };

  // Linien
  for(let i=1;i<visible.length;i++){
    const a=visible[i-1], b=visible[i];
    const al = .38*starAlpha(b);
    ctx.beginPath();
    ctx.moveTo(a.x+ox,a.y+oy);ctx.lineTo(b.x+ox,b.y+oy);
    ctx.strokeStyle=`rgba(225,232,255,${al})`;ctx.lineWidth=.8;ctx.stroke();
  }

  // Sterne
  visible.forEach((s,i)=>{
    const sx=s.x+ox, sy=s.y+oy;
    if(sx<-60||sx>width+60||sy<-60||sy>height+60) return;
    const age=ageOf(s);
    const isActive=i===activeIndex;
    const isSpecial=!!s.item.highlight;
    const appear=Math.min(1,age/.45);
    const pulse=isActive?1+.18*Math.sin(now*.006):1;
    const radius=(isSpecial?2.4:1.7)*(.4+.6*appear)*pulse;
    const al=starAlpha(s);
    if(isSpecial || age<1.2){
      const gr=(isSpecial?42:22);
      const strength=isSpecial?.62:.34*(1-age/1.2);
      const glow=ctx.createRadialGradient(sx,sy,0,sx,sy,gr);
      glow.addColorStop(0,`rgba(255,255,255,${strength*al})`);
      glow.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sx,sy,gr,0,Math.PI*2);ctx.fill();
    }
    ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);
    ctx.fillStyle=isSpecial?`rgba(255,255,255,${al})`:`rgba(245,247,255,${.92*al})`;ctx.fill();
  });

  // Lyrics direkt am Stern - verschwinden nach ein paar Sekunden
  ctx.textBaseline='middle';
  visible.forEach(s=>{
    const isSpecial=!!s.item.highlight;
    const la=labelAlpha(ageOf(s),isSpecial);
    if(la<=0) return;
    const sx=s.x+ox, sy=s.y+oy;
    const size=(isSpecial?27:18)*Math.min(1.1,Math.max(.85,unit));
    const dist=(isSpecial?20:13)*unit;
    ctx.font=`italic 400 ${size}px "Playfair Display", Georgia, serif`;
    ctx.textAlign=s.align;
    ctx.shadowColor=`rgba(255,255,255,${.35*la})`;ctx.shadowBlur=isSpecial?18:8;
    ctx.fillStyle=`rgba(245,247,255,${la})`;
    ctx.fillText(s.item.word, sx+s.nx*dist, sy+s.ny*dist);
    ctx.shadowBlur=0;
  });

  requestAnimationFrame(draw);
}
function update(){
  const t=audio.currentTime;
  elapsed.textContent=formatTime(t);
  if(Number.isFinite(audio.duration)&&audio.duration>0){
    duration.textContent=formatTime(audio.duration);
    seek.value=String(t/audio.duration*1000);
  }
  const index=words.reduce((found,w,i)=>w.time<=t?i:found,-1);
  if(index!==lastActive){
    lastActive=index;
    if(index>=0){
      intro.classList.add('hide');
    }else{
      intro.classList.remove('hide');
    }
  }
}
function renderWordList(){
  const list=document.querySelector('#wordList');
  list.innerHTML='';
  words.forEach((item,index)=>{
    const row=document.createElement('div');row.className='word-row';
    const time=document.createElement('input');time.type='number';time.min='0';time.step='.01';time.value=item.time;
    time.addEventListener('change',()=>{item.time=Math.max(0,Number(time.value)||0);saveWords();});
    const word=document.createElement('input');word.type='text';word.maxLength=32;word.value=item.word;
    word.addEventListener('change',()=>{item.word=word.value.trim()||item.word;saveWords();});
    const tag=document.createElement('span');tag.className='tag';tag.textContent=item.highlight?'SPECIAL GLOW':'STAR';
    const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.title='Remove word';
    remove.addEventListener('click',()=>{words.splice(index,1);saveWords();layoutStars();});
    row.append(time,word,tag,remove);list.append(row);
  });
  layoutStars();
}
playButton.addEventListener('click',async()=>{
  if(audio.paused){try{await audio.play();}catch(e){alert('Die Audiodatei konnte nicht abgespielt werden. Bitte prüfe, ob assets/reflections.mp3 vorhanden ist.');}}
  else audio.pause();
});
audio.addEventListener('play',()=>playIcon.textContent='Ⅱ');
audio.addEventListener('pause',()=>playIcon.textContent='▶');
audio.addEventListener('timeupdate',update);
audio.addEventListener('loadedmetadata',()=>{duration.textContent=formatTime(audio.duration);});
audio.addEventListener('ended',()=>{playIcon.textContent='▶';});
seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(seek.value)/1000*audio.duration;update();});
document.querySelector('#restartButton').addEventListener('click',()=>{audio.currentTime=0;update();});
document.querySelector('#editorToggle').addEventListener('click',()=>editor.classList.toggle('hidden'));
document.querySelector('#closeEditor').addEventListener('click',()=>editor.classList.add('hidden'));
document.querySelector('#addWord').addEventListener('click',()=>{
  const word=document.querySelector('#wordInput').value.trim();
  if(!word){alert('Enter a word first.');return;}
  const manual=document.querySelector('#timeInput').value;
  const time=manual===''?audio.currentTime:Number(manual);
  if(!Number.isFinite(time)||time<0){alert('Enter a valid timestamp.');return;}
  words.push({word,time,highlight:document.querySelector('#highlightInput').checked});
  document.querySelector('#wordInput').value='';
  document.querySelector('#timeInput').value='';
  document.querySelector('#highlightInput').checked=false;
  saveWords();
});
document.querySelector('#exportJson').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(words,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='reflections-timings.json';a.click();URL.revokeObjectURL(url);
});
document.querySelector('#importJson').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data)||!data.every(x=>typeof x.word==='string'&&Number.isFinite(Number(x.time))))throw new Error();
    words=data.map(x=>({word:x.word,time:Number(x.time),highlight:!!x.highlight}));saveWords();
  }catch{alert('Invalid timing JSON file.');}
  e.target.value='';
});
document.querySelector('#clearWords').addEventListener('click',()=>{
  if(confirm('Delete all word timings?')){words=[];saveWords();}
});
window.addEventListener('resize',resize);
resize();renderWordList();requestAnimationFrame(draw);update();


/* ===================== TAP-SYNC ===================== */
const $ = s => document.querySelector(s);
const syncPanel=$('#tapSync'), tapButton=$('#tapButton'), syncList=$('#syncList');
const SYNC_KEY='reflections-tapsync-draft-v1';
let draft=[], syncPtr=0, chips=[];

function syncOpen(){ return !syncPanel.classList.contains('hidden'); }
function buildDraft(force=false){
  const seq=words.map(w=>w.word).join('|');
  if(!force){
    try{
      const s=JSON.parse(localStorage.getItem(SYNC_KEY)||'null');
      if(s&&Array.isArray(s.items)&&s.items.map(x=>x.word).join('|')===seq){
        draft=s.items; syncPtr=Math.min(Math.max(0,s.ptr||0),draft.length); return;
      }
    }catch{}
  }
  draft=words.map(w=>({word:w.word,highlight:!!w.highlight,time:null,est:w.time}));
  syncPtr=0; saveDraft();
}
function saveDraft(){ try{localStorage.setItem(SYNC_KEY,JSON.stringify({items:draft,ptr:syncPtr}));}catch{} }
function draftToWords(){
  let prev=-Infinity;
  return draft.map(d=>{
    let t=(d.time!==null&&d.time!==undefined)?d.time:d.est;
    if(t<=prev) t=prev+0.01;
    prev=t;
    return {word:d.word,time:+t.toFixed(2),highlight:!!d.highlight};
  });
}
function buildChips(){
  syncList.innerHTML=''; chips=[];
  draft.forEach((d,i)=>{
    const chip=document.createElement('button'); chip.className='chip';
    const w=document.createElement('span'); w.textContent=d.word;
    const t=document.createElement('small');
    chip.append(w,t);
    chip.addEventListener('click',e=>{
      syncPtr=i; saveDraft();
      const ref=(d.time!==null&&d.time!==undefined)?d.time:d.est;
      audio.currentTime=Math.max(0,ref-3);
      renderSync(); e.currentTarget.blur();
    });
    syncList.append(chip); chips.push({chip,t});
  });
}
function renderSync(){
  const cur=draft[syncPtr];
  $('#syncPrev').textContent=syncPtr>0?draft[syncPtr-1].word:'';
  $('#syncCurrent').textContent=cur?cur.word:'✓ FERTIG';
  $('#syncNext').textContent=draft.slice(syncPtr+1,syncPtr+7).map(d=>d.word).join('  ');
  const tapped=draft.filter(d=>d.time!==null&&d.time!==undefined).length;
  $('#syncCount').textContent=`WORT ${Math.min(syncPtr+1,draft.length)} / ${draft.length} · ${tapped} GETAKTET`;
  chips.forEach((o,i)=>{
    const d=draft[i], has=d.time!==null&&d.time!==undefined;
    o.chip.classList.toggle('done',has);
    o.chip.classList.toggle('cur',i===syncPtr);
    o.t.textContent=has?d.time.toFixed(2):'–';
  });
  const c=chips[syncPtr];
  if(c){ const top=c.chip.offsetTop-syncList.offsetTop-syncList.clientHeight/2+20; syncList.scrollTop=Math.max(0,top); }
}
function flashButton(cls){ tapButton.classList.add(cls); setTimeout(()=>tapButton.classList.remove(cls),cls==='warn'?500:90); }
function syncTap(){
  if(!syncOpen()||syncPtr>=draft.length) return;
  if(audio.paused){ flashButton('warn'); $('#syncStatus').textContent='Erst Play drücken.'; return; }
  const offset=(Number($('#syncOffset').value)||0)/1000;
  const t=Math.max(0,audio.currentTime-offset*audio.playbackRate);
  draft[syncPtr].time=+t.toFixed(2);
  syncPtr++; saveDraft(); renderSync(); flashButton('flash');
  $('#syncStatus').textContent='';
}
function syncUndo(){
  if(syncPtr<=0) return;
  syncPtr--;
  const d=draft[syncPtr];
  const ref=(d.time!==null&&d.time!==undefined)?d.time:d.est;
  d.time=null; saveDraft();
  audio.currentTime=Math.max(0,ref-2);
  renderSync();
}
function syncBack(){ audio.currentTime=Math.max(0,audio.currentTime-3); }
function syncTogglePlay(){ if(audio.paused) audio.play().catch(()=>{}); else audio.pause(); }

function openSync(){
  editor.classList.add('hidden');
  buildDraft(); buildChips(); renderSync();
  audio.playbackRate=Number($('#syncSpeed').value)||1;
  syncPanel.classList.remove('hidden');
  syncPanel.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeSync(){ syncPanel.classList.add('hidden'); audio.playbackRate=1; }

$('#syncToggle').addEventListener('click',e=>{ syncOpen()?closeSync():openSync(); e.currentTarget.blur(); });
$('#closeSync').addEventListener('click',closeSync);
$('#editorToggle').addEventListener('click',()=>{ if(syncOpen()) closeSync(); });
tapButton.addEventListener('pointerdown',e=>{ e.preventDefault(); syncTap(); });
tapButton.addEventListener('click',e=>e.currentTarget.blur());
$('#syncPlay').addEventListener('click',e=>{ syncTogglePlay(); e.currentTarget.blur(); });
$('#syncBack').addEventListener('click',e=>{ syncBack(); e.currentTarget.blur(); });
$('#syncUndo').addEventListener('click',e=>{ syncUndo(); e.currentTarget.blur(); });
$('#syncSpeed').addEventListener('change',e=>{ audio.playbackRate=Number(e.target.value)||1; e.target.blur(); });
$('#syncApply').addEventListener('click',e=>{
  words=draftToWords(); saveWords(); lastActive=-1; update();
  const tapped=draft.filter(d=>d.time!==null&&d.time!==undefined).length;
  $('#syncStatus').textContent=`✓ ${tapped} von ${draft.length} Wörtern mit deinen Zeiten übernommen`+(tapped<draft.length?' (Rest: alte Schätzung)':'');
  e.currentTarget.blur();
});
$('#syncExport').addEventListener('click',e=>{
  const blob=new Blob([JSON.stringify(draftToWords(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='reflections-timings-synced.json';a.click();URL.revokeObjectURL(url);
  e.currentTarget.blur();
});
$('#syncReset').addEventListener('click',e=>{
  if(confirm('Alle getakteten Zeiten verwerfen und von vorne beginnen?')){
    buildDraft(true); buildChips(); renderSync(); audio.currentTime=0;
  }
  e.currentTarget.blur();
});
function typingTarget(el){ return el&&el.matches&&el.matches('input[type=text],input[type=number],select,textarea'); }
document.addEventListener('keydown',e=>{
  if(!syncOpen()||typingTarget(e.target)) return;
  if(e.code==='Space'){ e.preventDefault(); if(!e.repeat) syncTap(); }
  else if(e.code==='Backspace'){ e.preventDefault(); syncUndo(); }
  else if(e.code==='ArrowLeft'){ e.preventDefault(); syncBack(); }
  else if(e.code==='Enter'&&e.target.tagName!=='BUTTON'){ e.preventDefault(); syncTogglePlay(); }
});
document.addEventListener('keyup',e=>{ if(syncOpen()&&e.code==='Space'&&!typingTarget(e.target)) e.preventDefault(); });
audio.addEventListener('play',()=>{ $('#syncPlay').textContent='Ⅱ PAUSE'; });
audio.addEventListener('pause',()=>{ $('#syncPlay').textContent='▶ PLAY'; });
audio.addEventListener('timeupdate',()=>{ if(syncOpen()) $('#syncTime').textContent=audio.currentTime.toFixed(2)+' s'; });
