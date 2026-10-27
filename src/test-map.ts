import clipping from 'polygon-clipping';
import type {GameMap,Point,MultiPolygon,Road,Area} from './types';
import {capsule} from './geometry';
export function makeTestMap():GameMap {
  const road=(id:string,points:Point[],extra:Partial<Road>={}):Road=>({id,name:'Circuito de ensaio',kind:'residential',nodes:points.map((_,i)=>Number(id.replace(/\D/g,''))*100+i),points,width:12,layer:0,bridge:false,tunnel:false,surface:'asphalt',...extra});
  const roads=[road('test/1',[[-65,55],[-65,-55],[65,-55],[65,55],[-65,55]]),road('test/2',[[-65,0],[65,0]],{bridge:true,layer:1}),road('test/3',[[0,-55],[0,-35]],{surface:'dirt'})];
  const box=(x:number,z:number,w:number,h:number):MultiPolygon=>[[[[x,z],[x+w,z],[x+w,z+h],[x,z+h],[x,z]]]];
  const areas:Area[]=[{id:'test/building',kind:'building',polygons:box(-42,14,22,20),height:5,layer:0},{id:'test/water',kind:'water',polygons:box(-15,-35,30,70),height:0,layer:0},{id:'test/dirt',kind:'dirt',polygons:box(-40,-43,25,27),height:0,layer:0},{id:'test/grass',kind:'grass',polygons:box(25,18,26,23),height:0,layer:0}];
  areas.push({id:'test/forest',kind:'forest',polygons:box(42,25,15,19),height:0,layer:0});
  // An island hole is part of the water multipolygon.
  areas[1].polygons[0].push([[-5,17],[-5,27],[5,27],[5,17],[-5,17]]);
  const corridors=[0,1].map(layer=>{const p=roads.filter(r=>r.layer===layer).flatMap(r=>r.points.slice(1).map((b,i)=>capsule(r.points[i],b,r.width)));return {layer,polygons:clipping.union(p[0],...p.slice(1)) as MultiPolygon};});
  const graph:GameMap['graph']={nodes:{},edges:[]};roads.forEach(r=>r.nodes.forEach((n,i)=>{const k=`${n}@${r.layer}`;graph.nodes[k]=r.points[i];if(i)graph.edges.push({from:`${r.nodes[i-1]}@${r.layer}`,to:k,road:r.id});}));
  return {schemaVersion:1,name:'Pista de teste',origin:{lat:0,lon:0},bounds:{minX:-105,maxX:105,minZ:-90,maxZ:90},provenance:{synthetic:true,description:'Cenário sintético de verificação; não representa uma localização real.'},seed:247,roads,corridors,areas,rocks:[{id:'synthetic/rock/0',x:40,z:-25,radius:2,synthetic:true}],graph,spawn:{x:-65,z:38,heading:0},adaptation:{scale:1,maxBuildingHeight:8,roadWidths:{residential:12}},diagnostics:[]};
}
