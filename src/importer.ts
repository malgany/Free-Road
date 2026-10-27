import clipping from 'polygon-clipping';
import {capsule,validRing,ringArea,pointInRing,inMulti,boundsOf,seeded,circle,closest,distance,intersects} from './geometry';
import type {GameMap,Point,Ring,MultiPolygon,Area,Road} from './types';
import {fillMissingBuildings} from './scenery';
export interface OSMElement {type:string;id:number;lat?:number;lon?:number;nodes?:number[];tags?:Record<string,string>;members?:{type:string;ref:number;role:string}[]}
export interface RawOSM {elements:OSMElement[];remark?:string}
export interface Provenance {name:string;center:{lat:number;lon:number};size:number;[key:string]:unknown}
// Spherical azimuthal equidistant. Sub-metre sphere/ellipsoid discrepancy at this scale;
// all assets use this exact same transform. z points south, unlike geographic northing.
export function project(lat:number,lon:number,origin:{lat:number;lon:number},scale=1):Point {
  const rad=Math.PI/180,p=lat*rad,p0=origin.lat*rad,l=(lon-origin.lon)*rad;
  const c=Math.acos(Math.max(-1,Math.min(1,Math.sin(p0)*Math.sin(p)+Math.cos(p0)*Math.cos(p)*Math.cos(l))));
  const k=c<1e-10?1:c/Math.sin(c),R=6371008.8*scale;
  return [R*k*Math.cos(p)*Math.sin(l),-R*k*(Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l))].map(n=>Math.round(n*1000)/1000||0) as Point;
}
export function stitch(parts:number[][]):number[][] {
  const remaining=parts.map(p=>[...p]);const rings:number[][]=[];
  while(remaining.length){const ring=remaining.shift()!;let changed=true;
    while(ring[0]!==ring.at(-1)&&changed){changed=false;for(let i=0;i<remaining.length;i++){
      let p=remaining[i];if(p[0]===ring.at(-1)||p.at(-1)===ring.at(-1)){if(p.at(-1)===ring.at(-1))p=[...p].reverse();ring.push(...p.slice(1));remaining.splice(i,1);changed=true;break;}
    }}rings.push(ring);
  }return rings;
}
export function buildingHeight(tags:Record<string,string>,id:number,cap=8):number {
  const parse=(s:string|undefined)=>s&&/^\d+(\.\d+)?\s*(m)?$/.test(s.trim())?parseFloat(s):NaN;
  const h=parse(tags.height),levels=parse(tags['building:levels']);
  return Math.min(cap,h>0?h:levels>0?levels*3:3.5+(id%4)*0.6);
}
const driveable=new Set(['motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','service','road']);
export function prepare(raw:RawOSM,meta:Provenance):GameMap {
  if(!raw.elements?.length || raw.remark)throw new Error('Dados OSM ausentes ou incompletos.');
  if(!Number.isFinite(meta.size)||meta.size<100||meta.size>1000)throw new Error('Recorte deve ter entre 100 e 1000 metros.');
  const scale=1.15,half=meta.size*scale/2,clip:MultiPolygon=[[[[-half,-half],[half,-half],[half,half],[-half,half],[-half,-half]]]];
  const nodes=new Map(raw.elements.filter(e=>e.type==='node').map(n=>[n.id,project(n.lat!,n.lon!,meta.center,scale)]));
  const ways=new Map(raw.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const diagnostics:string[]=[],areas:Area[]=[],roads:Road[]=[];
  const widths:Record<string,number>={motorway:9,trunk:9,primary:9,secondary:8,tertiary:7,residential:6.5,unclassified:6,service:4.5,living_street:5,road:6};
  const kind=(t:Record<string,string>):Area['kind']|null=>(t.building&&t.building!=='no')||(t['building:part']&&t['building:part']!=='no')?'building':t.natural==='water'||t.waterway==='riverbank'?'water':t.landuse==='forest'||['wood','scrub','heath'].includes(t.natural)?'forest':['grass','meadow','recreation_ground','village_green'].includes(t.landuse)||t.leisure==='park'||t.natural==='grassland'?'grass':['brownfield','construction','quarry'].includes(t.landuse)||['sand','beach','bare_rock'].includes(t.natural)?'dirt':null;
  function addArea(id:string,t:Record<string,string>,outer:Ring[],holes:Ring[]){const k=kind(t);if(!k)return;
    const good=outer.filter(r=>{if(validRing(r))return true;diagnostics.push(`${id}: anel externo inválido descartado`);return false;});
    const poly:MultiPolygon=good.map(r=>[r]);
    for(const hole of holes){if(!validRing(hole)){diagnostics.push(`${id}: vazio inválido descartado`);continue;}const p=poly.find(p=>pointInRing(hole[0],p[0]));if(p)p.push(hole);else diagnostics.push(`${id}: vazio sem anel externo`);}
    if(!poly.length)return;
    // Clipping a valid footprint at a moving window can leave centimetre-sized
    // triangles. Discard only sub-tolerance fragments, not full source buildings.
    const clipped=(clipping.intersection(poly,clip) as MultiPolygon)
      .filter(p=>Math.abs(ringArea(p[0]))>=0.02)
      .map(p=>[p[0],...p.slice(1).filter(r=>Math.abs(ringArea(r))>=0.02)]);
    if(clipped.length)areas.push({id,kind:k,polygons:clipped,height:k==='building'?buildingHeight(t,Number(id.split('/')[1])):0,layer:Number(t.layer)||0});
  }
  const relationWays=new Set<number>();
  for(const e of raw.elements.filter(e=>e.type==='relation'&&kind(e.tags??{}))){
    const role=(r:string)=>stitch((e.members??[]).filter(m=>m.type==='way'&&(m.role===r||(r==='outer'&&!m.role))).map(m=>{relationWays.add(m.ref);const w=ways.get(m.ref);if(!w)diagnostics.push(`relation/${e.id}: way/${m.ref} ausente`);return w?.nodes??[];}).filter(p=>p.length>1)).map(ids=>{if(ids.some(id=>!nodes.has(id))){diagnostics.push(`relation/${e.id}: anel com nós ausentes descartado`);return [];}return ids.map(id=>nodes.get(id)!);});
    addArea(`relation/${e.id}`,e.tags??{},role('outer'),role('inner'));
  }
  for(const w of ways.values()){
    const t=w.tags??{},ids=w.nodes??[];
    if(ids.some(id=>!nodes.has(id))){diagnostics.push(`way/${w.id}: nós ausentes; descartado`);continue;}
    const points=ids.map(id=>nodes.get(id)!);
    const excludedService=t.highway==='service'&&['driveway','parking_aisle','drive-through'].includes(t.service);
    if(excludedService)diagnostics.push(`way/${w.id}: acesso interno (${t.service}) fora da rede de ruas desta amostra; preservado no bruto`);
    if(driveable.has(t.highway)&&!excludedService&&t.area!=='yes'&&points.length>1){
      if(meta.excludeUnsupported && t.tunnel && t.tunnel!=='no'){diagnostics.push(`way/${w.id}: túnel omitido no recorte plano`);continue;}
      const width=Number.parseFloat(t.width),lanes=Number(t.lanes);
      roads.push({id:`way/${w.id}`,name:t.name??'Via de serviço',kind:t.highway,nodes:ids,points,width:(Number.isFinite(width)&&width>2&&width<30?width:lanes>0&&lanes<7?lanes*3:widths[t.highway])*scale,layer:Number(t.layer)||0,bridge:!!t.bridge&&t.bridge!=='no',tunnel:!!t.tunnel&&t.tunnel!=='no',surface:['dirt','earth','ground','unpaved','gravel'].includes(t.surface)?'dirt':'asphalt'});
    }
    if(!relationWays.has(w.id)&&kind(t))addArea(`way/${w.id}`,t,[points],[]);
  }
  if(meta.excludeUnsupported){
    // A 2.5D map cannot correctly resolve stacked roads. Keep ground roads and remove
    // only the elevated road involved in such a crossing; retain bridges over water.
    for(let i=roads.length-1;i>=0;i--){const upper=roads[i];if(upper.layer===0)continue;
      const stacked=roads.some(other=>other!==upper&&other.layer!==upper.layer&&upper.points.slice(1).some((p,k)=>other.points.slice(1).some((q,l)=>intersects(upper.points[k],p,other.points[l],q))));
      if(stacked){diagnostics.push(`${upper.id}: via sobreposta em níveis diferentes omitida no recorte plano`);roads.splice(i,1);}
    }
  }
  // No independent geometry pipeline: prepared corridors drive drawing, collision exemptions and terrain tests.
  const corridors:GameMap['corridors']=[];
  for(const layer of [...new Set(roads.map(r=>r.layer))].sort()){
    const pieces=roads.filter(r=>r.layer===layer).flatMap(r=>r.points.slice(1).map((p,i)=>capsule(r.points[i],p,r.width)));
    if(pieces.length)corridors.push({layer,polygons:clipping.intersection(clipping.union(pieces[0],...pieces.slice(1)),clip) as MultiPolygon});
  }
  // Preserve full road/node source geometry. Graph keys include relative level; no geometric crossing creates a node.
  const graph:GameMap['graph']={nodes:{},edges:[]};
  for(const r of roads)for(let i=0;i<r.nodes.length;i++){const key=`${r.nodes[i]}@${r.layer}`;graph.nodes[key]=r.points[i];if(i)graph.edges.push({from:`${r.nodes[i-1]}@${r.layer}`,to:key,road:r.id});}
  const buildings=areas.filter(a=>a.kind==='building');
  for(const a of buildings){const c=corridors.find(c=>c.layer===a.layer);if(c&&clipping.intersection(a.polygons,c.polygons).length)diagnostics.push(`${a.id}: corredor toca edifício; corredor recortado pela implantação original (sem mover edifício)`);}
  // Trim only the paved shoulder intersecting true footprints. Centre lines remain unchanged and validation below rejects blocked routes.
  for(const c of corridors){const obstacles=buildings.filter(a=>a.layer===c.layer).map(a=>a.polygons);if(obstacles.length)c.polygons=clipping.difference(c.polygons,...obstacles) as MultiPolygon;}
  const solid=areas.filter(a=>a.kind==='building'||a.kind==='water');
  const rand=seeded(247),rocks:GameMap['rocks']=[];
  for(let i=0;i<70&&rocks.length<28;i++){
    const p:Point=[(rand()*2-1)*(half-10),(rand()*2-1)*(half-10)],radius=0.8+rand()*1.0;
    if(corridors.some(c=>inMulti(p,c.polygons))||solid.some(a=>inMulti(p,a.polygons)))continue;
    if(roads.some(r=>r.points.slice(1).some((b,j)=>distance(p,closest(p,r.points[j],b))<r.width/2+radius+4)))continue;
    if(solid.some(a=>clipping.intersection(a.polygons,[[circle(p,radius+2)]]).length))continue;
    rocks.push({id:`synthetic/rock/${rocks.length}`,x:p[0],z:p[1],radius,synthetic:true});
  }
  let spawnRoads=roads.filter(r=>!r.bridge&&!r.tunnel&&r.layer===0&&r.kind!=='service');
  if(!spawnRoads.length&&meta.spawnNearOrigin)spawnRoads=roads.filter(r=>!r.bridge&&!r.tunnel&&r.layer===0);
  const candidates=spawnRoads.flatMap(r=>r.points.slice(1).flatMap((p,i)=>{
    const a=r.points[i];if(!meta.spawnNearOrigin)return [{p:[(p[0]+a[0])/2,(p[1]+a[1])/2] as Point,a,b:p}];
    const base=closest([0,0],a,p),len=distance(a,p);if(len<0.1)return [];
    return [0,-5,5,-10,10,-20,20].map(offset=>{const t=Math.max(0,Math.min(1,(distance(a,base)+offset)/len));return {p:[a[0]+(p[0]-a[0])*t,a[1]+(p[1]-a[1])*t] as Point,a,b:p};});
  })).sort((a,b)=>Math.hypot(...a.p)-Math.hypot(...b.p));
  const spawn=candidates.find(c=>Math.abs(c.p[0])<half-12&&Math.abs(c.p[1])<half-12&&!solid.some(a=>clipping.intersection(a.polygons,[[circle(c.p,4)]]).length));
  if(!spawn)throw new Error('Não há ponto de partida livre no recorte.');
  const result:GameMap={schemaVersion:1,name:meta.name,origin:meta.center,bounds:{minX:-half,maxX:half,minZ:-half,maxZ:half},provenance:meta,seed:247,roads,corridors,graph,areas,rocks,spawn:{x:spawn.p[0],z:spawn.p[1],heading:Math.atan2(spawn.b[0]-spawn.a[0],-(spawn.b[1]-spawn.a[1]))},adaptation:{scale,maxBuildingHeight:8,roadWidths:widths},diagnostics};
  result.places=raw.elements.filter(e=>e.type==='node'&&e.tags?.name&&['neighbourhood','quarter','suburb','borough','city','town','village'].includes(e.tags.place)).map(e=>({id:'node/'+e.id,name:e.tags!.name,kind:e.tags!.place,point:nodes.get(e.id)!})).filter(p=>p.point);
  const neighbourhoods=new Set(result.places.map(p=>p.name));
  for(const w of ways.values()){const name=w.tags?.['addr:suburb']??w.tags?.['addr:district'];const point=nodes.get(w.nodes?.[0]??-1);if(name&&point&&!neighbourhoods.has(name)){result.places.push({id:'address/'+w.id,name,kind:'neighbourhood',point});neighbourhoods.add(name);}}
  if(meta.fillUnmappedBuildings)fillMissingBuildings(result);
  return result;
}
