import test from 'node:test';import assert from 'node:assert/strict';
import {CameraZoom} from '../src/camera';import {gameClock} from '../src/daylight';
import {initialState,stepCar} from '../src/vehicle';import {EMPTY_INPUT} from '../src/types';
import {prepare} from '../src/importer';import {makeTestMap} from '../src/test-map';import {CollisionWorld} from '../src/collision';
import {MapIndex} from '../src/spatial';import {fillMissingBuildings} from '../src/scenery';import {StableName,nearbyRegion} from '../src/place-names';

test('C percorre aérea, terceira pessoa, cabine e ortográfica fixa',()=>{
  const camera=new CameraZoom();assert.equal(camera.mode,'aerial');camera.cycle();assert.equal(camera.target,0.2);camera.cycle();assert.equal(camera.target,0);camera.cycle();assert.equal(camera.mode,'orthographic');camera.cycle();assert.equal(camera.mode,'aerial');
});
test('ortográfica não amplia e scroll atravessa a retenção dos dois lados',()=>{
  const camera=new CameraZoom();camera.wheel(120,0);camera.wheel(120,100);assert(!camera.orthographic);camera.wheel(120,600);assert(camera.orthographic);
  for(let i=0;i<10;i++)camera.wheel(120,700+i*60);assert.equal(camera.value,1);assert.equal(camera.target,1);
  camera.wheel(-120,1500);camera.wheel(-120,1600);assert(camera.orthographic);camera.wheel(-120,2100);assert(!camera.orthographic);assert.equal(camera.target,1);
  camera.wheel(-120,2200);assert(camera.target<1);
});
test('sensibilidade padrão preserva trajetória e ajuste suave reduz curva',()=>{
  const states=[undefined,1,0.4].map(sensitivity=>{const s=initialState({x:0,z:0,heading:0});for(let i=0;i<60;i++)stepCar(s,{...EMPTY_INPUT,forward:true,right:true},1/60,undefined,sensitivity);return s;});assert.deepEqual(states[0],states[1]);assert(states[2].heading<states[1].heading);
});
test('relógio comunica os horários exatos do ciclo',()=>{
  for(const [t,hour] of [[0,'06:00'],[300,'12:00'],[600,'18:00'],[690,'20:00'],[840,'00:00'],[990,'04:00'],[1080,'06:00']] as const)assert.equal(gameClock(t),hour);
});
test('floresta, mata e nomes de bairro entram no mapa preparado',()=>{
  const nodes=[{type:'node',id:1,lat:0,lon:-0.001},{type:'node',id:2,lat:0,lon:0.001},{type:'node',id:3,lat:0.001,lon:0.001},{type:'node',id:4,lat:0.001,lon:0.002},{type:'node',id:5,lat:0.002,lon:0.002},{type:'node',id:6,lat:0.002,lon:0.001},{type:'node',id:7,lat:0,lon:0,tags:{place:'neighbourhood',name:'Bairro de teste'}}];
  const m=prepare({elements:[...nodes,{type:'way',id:10,nodes:[1,2],tags:{highway:'residential',name:'Rua de teste'}},{type:'way',id:11,nodes:[3,4,5,6,3],tags:{natural:'wood'}}]},{name:'Teste',center:{lat:0,lon:0},size:700});assert(m.areas.some(a=>a.kind==='forest'));assert.equal(m.places?.[0].name,'Bairro de teste');assert.equal(nearbyRegion(m,[0,0]),'Bairro de teste');
});
test('índice espacial preserva superfícies, cruzamentos e nomes próximos',()=>{
  const m=makeTestMap(),i=new MapIndex(m);assert.equal(i.surface([35,30]),'grass');assert.equal(i.surface([-65,38]),'asphalt');assert.equal(i.surface([0,12]),'water');assert.equal(i.surface([85,20]),'neutral');assert.equal(i.nearest([-65,38]).road?.id,'test/1');assert.equal(i.nearest([10000,10000]).road,undefined);
});
test('construções ilustrativas são limitadas e não invadem rua, água ou partida',()=>{
  const m=makeTestMap();m.areas=m.areas.filter(a=>a.kind!=='building');fillMissingBuildings(m);const fake=m.areas.filter(a=>a.synthetic);assert(fake.length>0&&fake.length<=48);const w=new CollisionWorld(m);assert.equal(w.hit(m.spawn.x,m.spawn.z,m.spawn.heading),null);for(let z=-45;z<=45;z+=5)assert.equal(w.hit(-65,z,0),null);
});
test('nome da rua exige permanência breve e não pisca no cruzamento',()=>{
  const name=new StableName();assert(!name.update('Rua A',0));assert(name.update('Rua A',900));assert.equal(name.value,'Rua A');assert(!name.update('Rua B',1000));assert(!name.update('Rua A',1100));assert.equal(name.value,'Rua A');
});
