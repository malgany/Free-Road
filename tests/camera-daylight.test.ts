import test from 'node:test';import assert from 'node:assert/strict';
import {CameraZoom,CHASE_STOP} from '../src/camera';
import {daylightAt,CYCLE_SECONDS} from '../src/daylight';
import {initialState,stepCar} from '../src/vehicle';
import {EMPTY_INPUT} from '../src/types';

test('scroll começa no afastamento máximo e não atravessa a terceira pessoa em um gesto',()=>{
  const c=new CameraZoom();assert.equal(c.target,1);c.wheel(1e5,0);assert.equal(c.target,1);
  for(let i=0;i<30;i++)c.wheel(-1e5,100+i);assert.equal(c.target,CHASE_STOP);
  c.update(1);assert.equal(c.mode,'chase');
  c.wheel(-120,900);c.wheel(-120,950);c.wheel(-120,1000);assert.equal(c.target,0);
  c.update(1);assert.equal(c.mode,'cockpit');
});
test('zoom out sai da cabine, segura em 5 m e permite retornar ao máximo',()=>{
  const c=new CameraZoom();c.target=0;c.value=0;c.wheel(120,0);c.wheel(120,50);assert.equal(c.target,CHASE_STOP);
  c.wheel(120,80);c.wheel(120,100);assert.equal(c.target,CHASE_STOP);
  for(let i=0;i<12;i++)c.wheel(120,800+i*70);assert.equal(c.target,1);
});
test('câmera suaviza sem depender do fps e olhar tem limites naturais',()=>{
  const values=[30,60,120].map(fps=>{const c=new CameraZoom();c.target=0;for(let i=0;i<fps;i++)c.update(1/fps);return c.value;});
  assert(Math.max(...values)-Math.min(...values)<0.0001);
  const c=new CameraZoom();c.look(1e6,-1e6);assert.equal(c.yaw,1.55);assert.equal(c.pitch,0.55);c.center();assert.equal(c.yaw+c.pitch,0);
});
test('dia dura dez minutos; entardecer, noite e amanhecer acendem/apagam faróis gradualmente',()=>{
  assert.equal(daylightAt(599).phase,'Dia');assert.equal(daylightAt(600).phase,'Entardecer');
  assert.equal(daylightAt(645).daylight,0.5);assert(daylightAt(645).headlights>0&&daylightAt(645).headlights<1);
  assert.equal(daylightAt(700).phase,'Noite');assert.equal(daylightAt(700).headlights,1);
  assert.equal(daylightAt(1035).phase,'Amanhecer');assert.deepEqual(daylightAt(CYCLE_SECONDS),daylightAt(0));
  for(const edge of [600,690,990,1080])assert(Math.abs(daylightAt(edge-.001).daylight-daylightAt(edge+.001).daylight)<0.001);
});
test('carro alcança exatamente 199 km/h e mantém limite de ré',()=>{
  const s=initialState({x:0,z:0,heading:0});for(let i=0;i<1200;i++)stepCar(s,{...EMPTY_INPUT,forward:true},1/60);
  assert(Math.abs(s.speed*3.6-199)<1e-8);
  for(let i=0;i<1200;i++)stepCar(s,{...EMPTY_INPUT,backward:true},1/60);assert.equal(s.speed,-9);
});
