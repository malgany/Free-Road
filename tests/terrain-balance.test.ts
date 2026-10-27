import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR} from '../src/config';
import {initialState,stepCar,surfaceSpeedFactor} from '../src/vehicle';
import {EMPTY_INPUT} from '../src/types';
import {CollisionWorld} from '../src/collision';
import {TERRAIN_HEIGHT} from '../src/scene';
import {cacheEvictions,CACHE_BYTES} from '../src/map-cache';
import {makeTestMap} from '../src/test-map';

test('aceleração leva o dobro do tempo original para atingir 180',()=>{
 const s=initialState({x:0,z:0,heading:0});let ticks=0;
 while(s.speed<CAR.maxSpeed&&ticks<2000){stepCar(s,{...EMPTY_INPUT,forward:true},1/60);ticks++;}
 assert(ticks/60>=2*(CAR.maxSpeed/11));assert(ticks/60<10.1);
});
test('limites por superfície e redução progressiva ao sair do asfalto',()=>{
 for(const [surface,factor] of Object.entries(surfaceSpeedFactor)){
  const world={surfaceAt:()=>surface,move:(s:any,x:number,z:number,h:number)=>{s.x+=x;s.z+=z;s.heading=h;}} as unknown as CollisionWorld;
  const s=initialState({x:0,z:0,heading:0});s.vz=-CAR.maxSpeed;
  stepCar(s,{...EMPTY_INPUT,forward:true},1/60,world);
  assert(s.speed>=CAR.maxSpeed-0.21);
  for(let i=0;i<1200;i++)stepCar(s,{...EMPTY_INPUT,forward:true},1/60,world);
  assert(Math.abs(s.speed-CAR.maxSpeed*factor)<1e-8);
 }
});
test('terrenos possuem alturas distintas abaixo das ruas',()=>{
 assert.equal(TERRAIN_HEIGHT.neutral,0);assert.equal(TERRAIN_HEIGHT.forest,TERRAIN_HEIGHT.grass*2);
 assert.equal(new Set(Object.values(TERRAIN_HEIGHT)).size,5);assert(Math.max(...Object.values(TERRAIN_HEIGHT))<0.05);
});
test('cache descarta entradas antigas, excedentes e maiores que orçamento',()=>{
 const map=makeTestMap(),now=Date.now();const rows=Array.from({length:40},(_,i)=>({key:String(i),savedAt:now-i,map}));
 assert.deepEqual(cacheEvictions(rows,now),Array.from({length:8},(_,i)=>String(i+32)));
 assert.deepEqual(cacheEvictions([{key:'expired',savedAt:0,map}],now),['expired']);
 const big={...map,name:'x'.repeat(CACHE_BYTES)};
 assert.deepEqual(cacheEvictions([{key:'large',savedAt:now,map:big}],now),['large']);
});
