import './style.css';
import {GameScene} from './scene';
import {CollisionWorld} from './collision';
import {Controls} from './input';
import {initialState,stepCar,FixedLoop} from './vehicle';
import {validateMap,connectivityReport} from './validation';
import {EMPTY_INPUT,type GameMap,type Input,type CarState,type Point} from './types';
import {FIXED_STEP,CAR} from './config';
import {lerpAngle,closest,distance,wrapAngle} from './geometry';
import {readCurrentPosition,type Coordinates} from './location';
import {MapCache,BrowserMapStore,mapKey as regionKey} from './map-cache';
import {expansionTarget,rebaseMap} from './streaming';
import {CHASE_STOP} from './camera';
import {settingsMarkup} from './settings-ui';
import {loadMapInWorker} from './map-client';
import {gameClock} from './daylight';
import {nearbyRegion,StableName} from './place-names';

const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>';
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5a1 1 0 0 1 1.5-.86l13 7.5a1 1 0 0 1 0 1.72l-13 7.5A1 1 0 0 1 7 19.5z"/></svg>';


document.querySelector('#app')!.innerHTML=`
  <canvas id="view" tabindex="0" aria-label="Cenário 3D do jogo de direção"></canvas>
  <nav class="game-actions" aria-label="Controles do jogo"><button id="pause" class="game-button" title="Pausar ou continuar (Esc)" aria-label="Pausar">${pauseIcon}</button></nav>
  <section class="intro" id="intro"><div class="eyebrow">Exploração livre</div><h1>Vá sem<br>pressa.</h1><p>Ruas reais, um novo ponto de vista.<br>Escolha uma direção e aproveite<br>o caminho.</p><button id="locate" class="start">Jogar na minha região <span>⌖</span></button><button id="start" class="secondary-start">Começar no mapa de exemplo <span>↗</span></button><p class="location-disclosure">O navegador pedirá sua permissão. Para buscar as ruas, a área ao redor da posição será enviada ao OpenStreetMap. Trechos visitados são guardados neste navegador.</p><p id="intro-location-error" class="location-error" role="alert" hidden></p><div class="controls-guide"><kbd>W S</kbd><span>Acelerar · frear · dar ré</span><kbd>A D</kbd><span>Virar à esquerda · direita</span><kbd>R</kbd><span>Voltar ao início</span></div></section>
  <div class="hud" aria-label="Instrumentos"><div><div class="speed" id="speed">00</div><div class="unit">KM/H</div></div><div class="gear" id="gear">N</div><div class="trip"><span id="distance">0,00 km</span><small id="surface">Asfalto</small></div></div>
  <aside class="map-widget" aria-label="Minimapa"><canvas id="minimap" width="320" height="320"></canvas></aside><a class="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>
  <time id="game-clock" class="game-clock" aria-label="Horário do jogo" title="Entardecer 18:00 · Noite 20:00">06:00</time><div id="street-name" class="street-name" aria-live="polite"></div><div id="region-name" class="region-name" role="status"></div><div id="stream-status" class="stream-status" role="status" hidden></div>
  <div id="hint" class="hint" role="status" aria-live="polite"></div>
  <div class="pause-banner" id="paused" hidden><h2>Pausa no caminho.</h2><p>Quando quiser, é só continuar.</p><button id="resume" class="start">Continuar <span>↗</span></button><button id="options" class="secondary-start">Configurações</button><button id="reset" class="secondary-start">Voltar ao início <span>↺</span></button></div>
  ${settingsMarkup}
  <aside class="debug-panel" id="diagnostics" hidden><h2>Diagnóstico do protótipo</h2><pre id="debug-data"></pre><div class="debug-buttons"><button id="benchmark">Medir rota · 60 s</button><button id="acceptance">Testar colisões · 60 s</button><button id="export-report">Salvar relatório</button><button id="record">Gravar passeio</button></div><a href="maps/davis.json" download="davis.json">Dados derivados OSM · ODbL</a><pre id="report-summary"></pre></aside>
  <div class="touch" aria-label="Direção por toque"><div><button data-drive="KeyA" aria-label="Virar à esquerda">←</button><button data-drive="KeyD" aria-label="Virar à direita">→</button></div><div><button data-drive="KeyS" aria-label="Frear e dar ré">↓</button><button data-drive="KeyW" aria-label="Acelerar">↑</button></div></div>
  <div class="loading" id="loading"><h2>Preparando o caminho…</h2><p>Carregando o recorte local.</p></div>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
let scene:GameScene,world:CollisionWorld,map:GameMap,state:CarState,previous:CarState,safe:CarState;
let started=false,paused=true,mapKey='davis',debug=false,loading=false,lastTime=performance.now(),uiTime=0;
let currentMap:GameMap|null=null;
const mapCache=new MapCache(new BrowserMapStore(),loadMapInWorker);
let steeringSensitivity=1,minimapTime=0,nameTime=0;const streetName=new StableName(),regionName=new StableName();
let streamController:AbortController|null=null,streamGeneration=0,streamNext=0,streamBusy=false;
let lastRegion='',streamNoticeUntil=0,streamError='';
let locationAttempt=0,cancelActiveLocation:(()=>void)|null=null;
let report:Record<string,unknown>|null=null,frameTimes:number[]=[],recorder:MediaRecorder|null=null,chunks:Blob[]=[];
let run:null|{kind:'benchmark'|'acceptance';elapsed:number;frames:number[];stage:number;events:string[];contacts:Set<string>;positions:Point[]}=null;
const fixed=new FixedLoop();
const controls=new Controls(reason=>{if(reason==='key'&&!$('settings').hidden){closeSettings();return;}setPause(reason==='key'?!paused:true);},()=>{if($('settings').hidden)reset(true);});
const context=$<HTMLCanvasElement>('minimap').getContext('2d')!;
const mapLayer=document.createElement('canvas');mapLayer.width=768;mapLayer.height=768;const mc=mapLayer.getContext('2d')!;
let minimapTransform={scale:1,x:0,z:0};let path:Point[]=[];let lastPath=0;
function showHint(message:string){$('hint').textContent=message;$('hint').classList.add('show');window.setTimeout(()=>$('hint').classList.remove('show'),3000);}
function setPause(value:boolean){if(!started||loading)return;paused=value;controls.enabled=!value;controls.clear();fixed.reset();lastTime=performance.now();$('paused').hidden=!value;$('pause').innerHTML=value?playIcon:pauseIcon;if(value&&document.pointerLockElement)document.exitPointerLock();$('pause').setAttribute('aria-label',value?'Continuar':'Pausar');}
function start(){started=true;$('intro').hidden=true;setPause(false);$('view').focus();}
function reset(notify=false){if(!map||loading)return;state=initialState(map.spawn);previous={...state};safe={...state};fixed.reset();scene.cameraReady=false;scene.clearEffects();path=[];if(run){run=null;$('report-summary').textContent='Verificação interrompida pelo reset.';}if(notify)showHint('De volta ao ponto de partida.');}
function teleport(x:number,z:number,heading:number){state=initialState({x,z,heading});previous={...state};safe={...state};scene.cameraReady=false;}
async function loadMap(key:string){
  stopStreaming();loading=true;controls.clear();$('loading').hidden=false;
  try{
    let value:unknown;const embedded=document.getElementById(`embedded-${key}`);
    if(key==='current'&&currentMap)value=currentMap;
    else if(embedded)value=JSON.parse(embedded.textContent!);
    else{const res=await fetch(`maps/${key}.json`);if(!res.ok)throw new Error(`Não foi possível abrir maps/${key}.json (HTTP ${res.status}).`);if(!res.headers.get('content-type')?.includes('application/json'))throw new Error(`O arquivo maps/${key}.json está ausente ou não contém um mapa JSON.`);try{value=await res.json();}catch{throw new Error(`O arquivo maps/${key}.json contém JSON inválido. Regenere a amostra.`);}}
    validateMap(value);await installMap(value,key);loading=false;reset();buildMinimap();$('loading').hidden=true;lastTime=performance.now();
  }catch(e){loading=false;paused=true;controls.enabled=false;$('loading').innerHTML='<h2>O caminho não carregou.</h2><p id="load-error"></p><button id="retry">Tentar novamente</button><p><a href="?map=test">Abrir a pista de teste</a></p>';$('load-error').textContent=e instanceof Error?e.message:String(e);$('retry').onclick=()=>location.reload();throw e;}
}
async function installMap(value:GameMap,key:string,signal?:AbortSignal){stopStreaming();const nextWorld=new CollisionWorld(value);await scene.load(value,nextWorld,false,signal);map=value;world=nextWorld;mapKey=key;lastRegion=regionKey(value.origin);}
function locationError(message:string){for(const id of ['intro-location-error','settings-location-error']){const el=$(id);el.textContent=message;el.hidden=!message;}}
function stopStreaming(){streamGeneration++;streamController?.abort();streamController=null;streamBusy=false;streamNext=0;$('stream-status').hidden=true;}
async function streamMap(){
  if(streamBusy||loading||mapKey==='test'||performance.now()<streamNext)return;
  const center=expansionTarget(map,state);if(!center||regionKey(center)===lastRegion)return;
  const generation=streamGeneration,controller=new AbortController();streamController=controller;streamBusy=true;
  const status=$('stream-status');status.hidden=false;status.textContent='Carregando ruas adiante…';
  try{
    const result=await mapCache.get(center,()=>{},controller.signal);
    if(generation!==streamGeneration)return;
    const expanded=rebaseMap(result.map,map.origin),nextWorld=new CollisionWorld(expanded);
    // Never transplant the car into an obstacle or a window it has already passed.
    if(nextWorld.hit(state.x,state.z,state.heading))throw new Error('Aguardando um trecho com passagem livre…');
    await scene.load(expanded,nextWorld,true,controller.signal,()=>!nextWorld.hit(state.x,state.z,state.heading));if(generation!==streamGeneration)return;map=expanded;world=nextWorld;
    if(mapKey==='current')currentMap=map;
    lastRegion=regionKey(result.map.origin);streamError='';buildMinimap();
    status.textContent=result.cached?'Ruas recuperadas do cache':'Novas ruas prontas';
    streamNext=performance.now()+2500;streamNoticeUntil=performance.now()+2200;
  }catch(e){
    if(generation!==streamGeneration)return;
    streamError=e instanceof Error?e.message:String(e);
    status.textContent=`${streamError} A borda permanece protegida. Nova tentativa em 30 s.`;
    streamNext=performance.now()+30000;streamNoticeUntil=performance.now()+6500;
  }finally{if(generation===streamGeneration){streamBusy=false;streamController=null;}}
}
function setupCameraInput(){
  const canvas=$<HTMLCanvasElement>('view');let wasLocked=false;
  canvas.addEventListener('wheel',e=>{
    if(!started||paused||loading)return;e.preventDefault();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
    scene.zoom.wheel(delta,performance.now());
    if(scene.zoom.target>0&&document.pointerLockElement===canvas)document.exitPointerLock();
  },{passive:false});
  window.addEventListener('mousemove',e=>{
    if(paused||scene.zoom.mode!=='cockpit')return;
    if(document.pointerLockElement===canvas)scene.zoom.look(e.movementX,e.movementY);
    else if(e.target===canvas){const b=canvas.getBoundingClientRect();scene.zoom.yaw=((e.clientX-b.left)/b.width-0.5)*3.1;scene.zoom.pitch=(0.5-(e.clientY-b.top)/b.height)*0.95;}
  });
  canvas.addEventListener('click',()=>{
    if(paused||scene.zoom.mode!=='cockpit')return;
    try{Promise.resolve(canvas.requestPointerLock()).then(()=>{if(document.pointerLockElement===canvas)scene.zoom.center();}).catch(()=>showHint('Mova o cursor sobre o cenário para olhar ao redor.'));}catch{showHint('Mova o cursor sobre o cenário para olhar ao redor.');}
  });
  canvas.addEventListener('dblclick',()=>scene.zoom.center());
  document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(wasLocked&&!locked&&scene.zoom.target===0&&!paused)setPause(true);wasLocked=locked;});
  window.addEventListener('keydown',e=>{if(!started||paused||e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;if(e.code==='KeyC'){scene.zoom.cycle();if(document.pointerLockElement&&scene.zoom.target!==0)document.exitPointerLock();}if(e.code==='KeyX')scene.zoom.center();});
}
function loadingMessage(message:string){$('loading').innerHTML='<h2>Preparando o caminho…</h2><p id="loading-status" role="status"></p><button id="cancel-location">Cancelar</button>';$('loading-status').textContent=message;$('cancel-location').onclick=()=>cancelActiveLocation?.();}
async function loadLocation(center?:Coordinates){
  if(loading)return;stopStreaming();const fromSettings=!$('settings').hidden;const wasPlaying=started&&!paused;locationError('');if(wasPlaying)setPause(true);
  const attempt=++locationAttempt,controller=new AbortController();
  cancelActiveLocation=()=>{locationAttempt++;controller.abort();cancelActiveLocation=null;loading=false;$('loading').hidden=true;locationError('Busca cancelada.');if(fromSettings){$('settings').hidden=false;$('paused').hidden=true;}else if(wasPlaying)setPause(false);lastTime=performance.now();fixed.reset();};
  controls.clear();loading=true;$('loading').hidden=false;loadingMessage(center?'Buscando as ruas…':'Permita o acesso à localização no navegador.');
  try{
    let accuracy:number|undefined;
    if(!center){const found=await readCurrentPosition(navigator.geolocation);if(attempt!==locationAttempt)return;center=found.center;accuracy=found.accuracy;}
    const {map:value,cached}=await mapCache.get(center,message=>loadingMessage(message),controller.signal);if(attempt!==locationAttempt)return;
    await installMap(value,'current',controller.signal);if(attempt!==locationAttempt)return;currentMap=value;
    const select=$<HTMLSelectElement>('map-select');if(!select.querySelector('option[value="current"]'))select.add(new Option('Minha região','current'));select.value='current';
    loading=false;reset();buildMinimap();$('loading').hidden=true;$('settings').hidden=true;start();
    showHint(accuracy!==undefined&&accuracy>1000?'Localização aproximada. Você pode informar coordenadas nos ajustes.':cached?'Região recuperada do cache local. Bom passeio!':'Pronto! O carro está em uma rua próxima.');
  }catch(e){
    if(attempt!==locationAttempt)return;
    loading=false;$('loading').hidden=true;locationError(e instanceof Error?e.message:'Não foi possível carregar esta região.');
    if(fromSettings){$('settings').hidden=false;$('paused').hidden=true;}else if(wasPlaying)setPause(false);
  }finally{if(attempt===locationAttempt){cancelActiveLocation=null;lastTime=performance.now();fixed.reset();}}
}
function buildMinimap(){
  const b=map.bounds,s=Math.min(750/(b.maxX-b.minX),750/(b.maxZ-b.minZ));minimapTransform={scale:s,x:384-(b.maxX+b.minX)/2*s,z:384-(b.maxZ+b.minZ)/2*s};
  mc.fillStyle='#e1ddca';mc.fillRect(0,0,mapLayer.width,mapLayer.height);mc.save();mc.translate(minimapTransform.x,minimapTransform.z);mc.scale(s,s);
  const poly=(rings:Point[][])=>{mc.beginPath();for(const ring of rings){ring.forEach((p,i)=>i?mc.lineTo(...p):mc.moveTo(...p));mc.closePath();}mc.fill('evenodd');};
  for(const a of map.areas){mc.fillStyle=({forest:'#526b43',building:'#b3ad95',water:'#75aeab',grass:'#b4c19e',dirt:'#c7ae8d'})[a.kind];for(const p of a.polygons)poly(p);}
  mc.fillStyle='#687d76';for(const c of map.corridors)for(const p of c.polygons)poly(p);mc.restore();
}
function updateMinimap(car=state){
  const t=minimapTransform,span=Math.min(220,(map.bounds.maxX-map.bounds.minX)/3,(map.bounds.maxZ-map.bounds.minZ)/3),scale=320/span;
  context.fillStyle='#e1ddca';context.fillRect(0,0,320,320);context.save();
  context.translate(160,160);context.rotate(-car.heading);context.scale(scale,scale);context.translate(-car.x,-car.z);
  context.drawImage(mapLayer,-t.x/t.scale,-t.z/t.scale,mapLayer.width/t.scale,mapLayer.height/t.scale);
  context.strokeStyle='#dd9a3c';context.lineWidth=2/scale;context.beginPath();path.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p));context.stroke();context.restore();
  // Vehicle stays upright. World and north marker rotate around it.
  context.save();context.translate(160,160);context.fillStyle='#203d40';context.strokeStyle='#fff4ce';context.lineWidth=2;
  context.beginPath();context.moveTo(0,-13);context.lineTo(9,10);context.lineTo(0,5);context.lineTo(-9,10);context.closePath();context.fill();context.stroke();
  context.rotate(-car.heading);context.translate(0,-139);context.rotate(car.heading);context.font='bold 18px Segoe UI';context.textAlign='center';context.fillStyle='#203d40';context.strokeStyle='#fff4ce';context.lineWidth=3;context.strokeText('N',0,6);context.fillText('N',0,6);context.restore();
}
function nearestRoad(){return world.index.nearest([state.x,state.z]).road;}
function refreshNames(now:number){const closest=world.index.nearest([state.x,state.z]),name=closest.road&&closest.distance<closest.road.width/2+7&&closest.road.name!=='Via de serviço'?closest.road.name:'';
  if(streetName.update(name,now)){$('street-name').textContent=name;$('street-name').classList.toggle('visible',!!name);}
  if(regionName.update(nearbyRegion(map,[state.x,state.z]),now)&&regionName.value){const el=$('region-name');el.textContent=regionName.value;el.classList.remove('announce');void el.offsetWidth;el.classList.add('announce');}
}
function refreshUI(dt:number){
  $('speed').textContent=Math.round(Math.abs(state.speed)*3.6).toString().padStart(2,'0');$('gear').textContent=state.speed<-0.2?'R':state.speed>0.2?'D':'N';$('distance').textContent=(state.distance/1000).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' km';
  const surface=world.surfaceAt([state.x,state.z]);$('surface').textContent=({forest:'Mata',asphalt:'Asfalto',grass:'Grama',dirt:'Terra',neutral:'Chão neutro',water:'Água'})[surface];
  if(state.distance-lastPath>3){path.push([state.x,state.z]);if(path.length>400)path.shift();lastPath=state.distance;}if(state.distance<lastPath)lastPath=0;
  $('game-clock').textContent=gameClock(scene.dayTime);
  $('cache-info').textContent=mapCache.store instanceof BrowserMapStore&&mapCache.store.persistent?'Cache local ativo · até 64 regiões · 30 dias':'Cache da sessão ativo; persistência depende do navegador.';
  if(!streamBusy&&performance.now()>streamNoticeUntil)$('stream-status').hidden=true;
  if(started&&!paused&&!run)void streamMap();
  if(debug){const r=nearestRoad(),fps=frameTimes.length?1000/(frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length):0;
    $('debug-data').textContent=`${map.name}\n${paused?'PAUSADO':'SIMULAÇÃO 60 Hz'} · ${fps.toFixed(0)} fps\nQuadro: ${(dt*1000).toFixed(1)} ms\nX ${state.x.toFixed(1)} · Z ${state.z.toFixed(1)}\nRumo ${(state.heading*180/Math.PI).toFixed(1)}°\nNível ${world.layerAt([state.x,state.z])}\nVia ${r?.id??'—'} · ${r?.name??'—'}\nContato ${state.contact??'livre'}\nMalhas ${scene.renderer.info.render.calls}\nTriângulos ${scene.renderer.info.render.triangles}\nColisores ${world.obstacles.length}\nLimites X ${map.bounds.minX.toFixed(0)} / ${map.bounds.maxX.toFixed(0)} · Z ${map.bounds.minZ.toFixed(0)} / ${map.bounds.maxZ.toFixed(0)}\nÚltima expansão: ${streamError||"OK"}\nRastros ${scene.trailAges.filter(v=>v<90).length}/2048\nPoeira ${scene.dustAges.filter(v=>v<1.4).length}/48\nMagenta: obstáculos · verde: vias${run?`\n${run.kind==='acceptance'?'COLISÕES':'ROTA'}: ${run.elapsed.toFixed(1)} / 60 s`:''}`;
  }
}
const segments=[
  {time:0,label:'Acelerar',spawn:[-65,38,0]}, {time:2.8,label:'Frear até a ré'}, {time:5.5,label:'Curvar em ré'},
  {time:7,label:'Reset e curva',spawn:[-65,38,0]}, {time:12,label:'Ponte e cruzamento',spawn:[-52,0,Math.PI/2]},
  {time:19,label:'Frear depois da ponte'}, {time:23,label:'Colisão com prédio',spawn:[-30,46,0]},
  {time:27,label:'Colisão com pedra',spawn:[40,-9,0]}, {time:31,label:'Margem de água',spawn:[-30,12,Math.PI/2]},
  {time:35,label:'Vazio do multipolígono',spawn:[0,22,0]}, {time:38,label:'Borda do recorte',spawn:[85,70,Math.PI/2]},
  {time:42,label:'Poeira na terra',spawn:[-38,-30,Math.PI/2]}, {time:46,label:'Retorno à pista',spawn:[-65,38,0]},
  {time:55,label:'Reset final',spawn:[-65,38,0]}
];
function runInput():Input {
  const r=run!;const input={...EMPTY_INPUT};
  if(r.kind==='acceptance'){
    let idx=0;for(let i=0;i<segments.length;i++)if(r.elapsed>=segments[i].time)idx=i;
    if(idx!==r.stage){r.stage=idx;const seg=segments[idx];if(seg.spawn)teleport(seg.spawn[0],seg.spawn[1],seg.spawn[2]);r.events.push(`${r.elapsed.toFixed(2)} s · ${seg.label}`);showHint(seg.label);}
    if(idx===1||idx===2||idx===5)input.backward=true;else if(idx<13)input.forward=true;
    if(idx===2)input.left=true;if(idx===3)input.right=r.elapsed>9;
  }else{
    // Reproducible workload on the real map: acceleration, brake/reverse, turn, collision and reset.
    const cycle=Math.floor(r.elapsed/15),t=r.elapsed%15;
    if(cycle!==r.stage){r.stage=cycle;teleport(map.spawn.x,map.spawn.z,map.spawn.heading);r.events.push(`${r.elapsed.toFixed(2)} s · volta ${cycle+1}`);}
    if(t<5||t>11)input.forward=true;else if(t<9)input.backward=true;else input.brake=true;
    input.right=t>3&&t<5;input.left=t>11.5;
  }return input;
}
function finishRun(){const r=run!;const values=[...r.frames].sort((a,b)=>a-b),mean=values.reduce((a,b)=>a+b,0)/(values.length||1),p95=values[Math.floor(values.length*.95)]??0;
  report={createdAt:new Date().toISOString(),kind:r.kind,map:map.name,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio,renderPixelRatio:scene.renderer.getPixelRatio()},durationSeconds:r.elapsed,frames:values.length,meanFps:1000/mean,p95FrameMs:p95,meetsProposedBudget:p95<=20,simulationHz:60,route:'fixed-input-v1',contacts:[...r.contacts],events:r.events,graph:connectivityReport(map),diagnostics:map.diagnostics,renderer:scene.renderer.getContext().getParameter(scene.renderer.getContext().VERSION)};
  $('report-summary').textContent=`\nCONCLUÍDO · ${r.kind==='acceptance'?'colisões':'rota'}\n${(1000/mean).toFixed(1)} fps médios\np95 ${p95.toFixed(2)} ms\n${p95<=20?'Meta de quadro atendida.':'Meta de 20 ms não atingida.'}\nContatos: ${[...r.contacts].join(', ')||'nenhum'}\nRelatório pronto para salvar.`;
  run=null;reset();if(recorder?.state==='recording')recorder.stop();showHint('Verificação concluída. Relatório disponível.');
}
async function startRun(kind:'benchmark'|'acceptance'){
  const key=kind==='acceptance'?'test':'davis';if(mapKey!==key)await loadMap(key);$<HTMLSelectElement>('map-select').value=key;start();
  run={kind,elapsed:0,frames:[],stage:-1,events:[],contacts:new Set(),positions:[]};$('report-summary').textContent='Verificação em andamento. Mantenha esta aba visível.';
  if(!debug)toggleDebug();
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function toggleRecording(){
  if(recorder?.state==='recording'){recorder.stop();return;}
  if(!('MediaRecorder' in window)||!$<HTMLCanvasElement>('view').captureStream){showHint('Gravação não disponível neste navegador.');return;}
  const stream=$<HTMLCanvasElement>('view').captureStream(30);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
  chunks=[];recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{download(new Blob(chunks,{type:recorder!.mimeType}),'rua-livre-passeio.webm');stream.getTracks().forEach(t=>t.stop());$('record').textContent='Gravar passeio';};recorder.start(1000);$('record').textContent='Parar e salvar vídeo';showHint('Gravando apenas o cenário do jogo.');
}
function toggleDebug(){debug=!debug;$('diagnostics').hidden=!debug;scene.debug.visible=debug;scene.debugEnabled=debug;$('debug-toggle').textContent=debug?'Ocultar diagnóstico (F3)':'Mostrar diagnóstico (F3)';}
function showSettings(){$<HTMLSelectElement>('camera-select').value=scene.orthographic?'orthographic':scene.zoom.target===0?'cockpit':scene.zoom.target===CHASE_STOP?'chase':'perspective';if(started)setPause(true);$('paused').hidden=true;$('settings').hidden=false;$('close-settings').focus();}
function closeSettings(){$('settings').hidden=true;if(started){setPause(true);$('options').focus();}else $('start').focus();}
$('start').onclick=start;$('resume').onclick=()=>setPause(false);$('pause').onclick=()=>{if(!started)start();else setPause(!paused);};$('reset').onclick=()=>reset(true);
function chooseTab(id:string){document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>{const active=button.dataset.tab===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(button.getAttribute('aria-controls')!).hidden=!active;});}
const tabButtons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));tabButtons.forEach((button,i)=>{button.onclick=()=>chooseTab(button.dataset.tab!);button.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const next=tabButtons[(i+(e.key==='ArrowRight'?1:-1)+tabButtons.length)%tabButtons.length];chooseTab(next.dataset.tab!);next.focus();}};});
$<HTMLInputElement>('steering-sensitivity').oninput=e=>{steeringSensitivity=Number((e.target as HTMLInputElement).value);$('steering-value').textContent=Math.round(steeringSensitivity*100)+'%';};
$<HTMLInputElement>('camera-height').oninput=e=>{scene.aerialHeight=Number((e.target as HTMLInputElement).value);$('height-value').textContent=scene.aerialHeight+' m';};
$('defaults').onclick=()=>{steeringSensitivity=1;scene.aerialHeight=105;scene.zoom.select('aerial');scene.reduced=false;scene.renderer.shadowMap.enabled=true;scene.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));scene.resize(innerWidth,innerHeight);$<HTMLInputElement>('steering-sensitivity').value='1';$<HTMLInputElement>('camera-height').value='105';$('steering-value').textContent='100%';$('height-value').textContent='105 m';$<HTMLInputElement>('reduced').checked=false;$<HTMLSelectElement>('camera-select').value='perspective';};
$('options').onclick=showSettings;$('close-settings').onclick=closeSettings;$('settings-done').onclick=closeSettings;
$('locate').onclick=()=>void loadLocation();$('locate-settings').onclick=()=>void loadLocation();
$('coordinates-go').onclick=()=>{const lat=$<HTMLInputElement>('latitude'),lon=$<HTMLInputElement>('longitude');if(!lat.value.trim()||!lon.value.trim()||!lat.validity.valid||!lon.validity.valid){locationError('Informe latitude e longitude válidas.');return;}void loadLocation({lat:lat.valueAsNumber,lon:lon.valueAsNumber});};
$('debug-toggle').onclick=()=>{toggleDebug();closeSettings();};
$<HTMLSelectElement>('map-select').onchange=async e=>{try{run=null;await loadMap((e.target as HTMLSelectElement).value);}catch{}};
$<HTMLSelectElement>('camera-select').onchange=e=>{const mode=(e.target as HTMLSelectElement).value;scene.zoom.select(mode==='perspective'?'aerial':mode as 'chase'|'cockpit'|'orthographic');};
$<HTMLSelectElement>('time-select').onchange=e=>{scene.dayTime=Number((e.target as HTMLSelectElement).value);};
$('clear-cache').onclick=async()=>{stopStreaming();try{await mapCache.clear();showHint('Mapas salvos removidos.');}catch{showHint('O navegador não permitiu limpar o armazenamento.');}};
$<HTMLInputElement>('reduced').onchange=e=>{scene.reduced=(e.target as HTMLInputElement).checked;scene.renderer.shadowMap.enabled=!scene.reduced;scene.renderer.setPixelRatio(scene.reduced?1:Math.min(devicePixelRatio,1.5));scene.resize(innerWidth,innerHeight);scene.clearEffects();};
$('benchmark').onclick=()=>void startRun('benchmark').catch(()=>{});$('acceptance').onclick=()=>void startRun('acceptance').catch(()=>{});$('record').onclick=toggleRecording;
$('export-report').onclick=()=>{if(!report){showHint('Execute uma verificação antes de salvar.');return;}download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'rua-livre-relatorio.json');};
const dataLink=document.querySelector<HTMLAnchorElement>('.debug-panel a')!;
dataLink.onclick=e=>{e.preventDefault();download(new Blob([JSON.stringify(map)],{type:'application/json'}),mapKey==='test'?'pista-teste.json':'regiao-osm.json');};
window.addEventListener('keydown',e=>{if(e.code==='F3'){e.preventDefault();toggleDebug();}});
// Focus trapping in the settings dialog.
$('settings').addEventListener('keydown',e=>{if(e.key!=='Tab')return;const els=Array.from($('settings').querySelectorAll<HTMLElement>('button,select,input')).filter(el=>el.getClientRects().length>0);const i=els.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&i===0){e.preventDefault();els.at(-1)!.focus();}else if(!e.shiftKey&&i===els.length-1){e.preventDefault();els[0].focus();}});
function frame(now:number){
  requestAnimationFrame(frame);const dt=Math.max(0,Math.min(0.1,(now-lastTime)/1000));const realDt=(now-lastTime)/1000;lastTime=now;if(loading||!state)return;
  let alpha=1,input=controls.read();
  if(started&&!paused){
    if(run){run.frames.push(realDt*1000);}
    alpha=fixed.advance(realDt,()=>{previous={...state};if(run){input=runInput();run.elapsed+=FIXED_STEP;}
      stepCar(state,input,FIXED_STEP,world,steeringSensitivity);
      if(Number.isFinite(state.x)&&Number.isFinite(state.z)&&!world.hit(state.x,state.z,state.heading))safe={...state};else{state={...safe,vx:0,vz:0,speed:0};showHint('Posição segura recuperada.');}
      if(run&&state.contact)run.contacts.add(state.contact);
    });
    if(run&&run.elapsed>=60)finishRun();
  }
  const rendered={...state,x:previous.x+(state.x-previous.x)*alpha,z:previous.z+(state.z-previous.z)*alpha,heading:lerpAngle(previous.heading,state.heading,alpha)};
  const braking=!!input.brake||(input.backward&&state.speed>0)||(input.forward&&state.speed<0);
  scene.render(rendered,dt,braking,input.backward||state.speed<-0.2,started&&!paused);frameTimes.push(realDt*1000);if(frameTimes.length>90)frameTimes.shift();
  minimapTime+=dt;if(minimapTime>=1/30){updateMinimap(rendered);minimapTime=0;}nameTime+=dt;if(nameTime>=0.3){refreshNames(now);nameTime=0;}
  uiTime+=dt;if(uiTime>=0.1){refreshUI(dt);uiTime=0;}
}
async function init(){
  try{scene=new GameScene($<HTMLCanvasElement>('view'));scene.resize(innerWidth,innerHeight);window.addEventListener('resize',()=>scene.resize(innerWidth,innerHeight));setupCameraInput();
    const key=new URLSearchParams(location.search).get('map')==='test'?'test':'davis';await loadMap(key);$<HTMLSelectElement>('map-select').value=key;requestAnimationFrame(frame);
    $('view').addEventListener('webglcontextlost',e=>{e.preventDefault();setPause(true);$('loading').hidden=false;$('loading').innerHTML='<h2>A renderização foi interrompida.</h2><p>O navegador perdeu o contexto gráfico. Recarregue para retomar.</p><button onclick="location.reload()">Recarregar</button>';});
  }catch(e){if(!scene){$('loading').innerHTML='<h2>Não foi possível iniciar o 3D.</h2><p>Este protótipo precisa de um navegador com WebGL 2 e aceleração gráfica habilitada.</p>';}}
}
void init();
