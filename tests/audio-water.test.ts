import test from 'node:test';import assert from 'node:assert/strict';
import {drivingMix,ImpactGate,CUES} from '../src/audio-model';
import {initialState,stepCar} from '../src/vehicle';import {EMPTY_INPUT} from '../src/types';import {CAR} from '../src/config';
import {CollisionWorld} from '../src/collision';import {makeTestMap} from '../src/test-map';import {ImpactParticles} from '../src/impact-particles';

test('mix de direção distingue motor, curva, freio, ré, água e pausa',()=>{
 const s=initialState({x:0,z:0,heading:0});s.speed=20;s.steer=.2;
 const asphalt=drivingMix(s,EMPTY_INPUT,'asphalt',true),water=drivingMix(s,EMPTY_INPUT,'water',true),paused=drivingMix(s,EMPTY_INPUT,'grass',false);
 assert(asphalt.engineGain>0&&asphalt.skidGain>0);assert(water.roadGain>asphalt.roadGain);assert.equal(water.skidGain,0);
 assert(drivingMix(s,{...EMPTY_INPUT,brake:true},'asphalt',true).skidGain>asphalt.skidGain);
 assert.equal(paused.engineGain+paused.roadGain+paused.skidGain,0);s.speed=-3;assert(drivingMix(s,EMPTY_INPUT,'asphalt',true).reverse);assert(!drivingMix(s,EMPTY_INPUT,'asphalt',false).reverse);
 assert.equal(CUES.menu.length,3);assert.notEqual(CUES.error[0],CUES.success[0]);
});
test('impactos físicos geram um evento forte; manter acelerador na parede não repete explosões',()=>{
 const world=new CollisionWorld(makeTestMap()),s=initialState({x:-30,z:38,heading:0});s.vz=-20;let strong=0;const gate=new ImpactGate();
 for(let i=0;i<180;i++){stepCar(s,{...EMPTY_INPUT,forward:true},1/60,world);if(s.impact&&gate.accept(s.impact.strength,i/60)){strong++;assert(Number.isFinite(s.impact.x));}}
 assert.equal(strong,1);assert(!gate.accept(.8,10));
});
test('água permite cruzar a margem, limita aceleração e ré a 18 km/h',()=>{
 const world=new CollisionWorld(makeTestMap()),s=initialState({x:-20,z:12,heading:Math.PI/2});
 for(let i=0;i<180;i++)stepCar(s,{...EMPTY_INPUT,forward:true},1/60,world);
 assert(s.x>-15&&s.x<15);assert.equal(s.contact,null);assert.equal(world.surfaceAt([s.x,s.z]),'water');assert(s.speed<=CAR.maxSpeed*.1+.001);
 const fake={surfaceAt:()=> 'water',move:(state:any,x:number,z:number,h:number)=>{state.x+=x;state.z+=z;state.heading=h;}} as unknown as CollisionWorld;
 const reverse=initialState({x:0,z:0,heading:0});reverse.vz=9;
 for(let i=0;i<600;i++)stepCar(reverse,{...EMPTY_INPUT,backward:true},1/60,fake);
 assert.equal(reverse.speed,-5);
});
test('partículas têm pool fixo, pausa congela e expiração libera todas as instâncias',()=>{
 const p=new ImpactParticles();p.burst(1,2,0,1,15);assert.equal(p.ages.filter(a=>a===0).length,16);p.update(0);assert.equal(p.ages[0],0);const colorVersion=p.mesh.instanceColor!.version;p.burst(0,0,1,0,10,false,'#9c9e80');assert(p.mesh.instanceColor!.version>colorVersion);
 for(let i=0;i<100;i++)p.burst(0,0,1,0,30);assert.equal(p.mesh.count,64);p.update(.7);assert(p.ages.every(a=>a>=.65));p.clear();assert(p.ages.every(a=>a===2));
});
