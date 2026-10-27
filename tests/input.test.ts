import test from 'node:test';import assert from 'node:assert/strict';import {Controls} from '../src/input';
test('perda de foco e ocultação limpam todas as entradas; Esc distingue pausa manual',()=>{
  const w=new EventTarget(),d=Object.assign(new EventTarget(),{hidden:false,querySelectorAll:()=>[]});
  Object.assign(globalThis,{window:w,document:d,HTMLInputElement:class{},HTMLSelectElement:class{}});
  const reasons:string[]=[];let resets=0;const controls=new Controls(r=>reasons.push(r),()=>resets++);controls.enabled=true;
  const key=(type:string,code:string)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{code,repeat:false});w.dispatchEvent(e);};
  key('keydown','KeyW');key('keydown','KeyA');assert(controls.read().forward&&controls.read().left);
  w.dispatchEvent(new Event('blur'));assert.equal(controls.keys.size,0);assert.deepEqual(reasons,['blur']);
  key('keydown','KeyS');d.hidden=true;d.dispatchEvent(new Event('visibilitychange'));assert.equal(controls.keys.size,0);assert.deepEqual(reasons,['blur','blur']);
  key('keydown','Escape');assert.equal(reasons.at(-1),'key');key('keydown','KeyR');assert.equal(resets,1);
  controls.enabled=false;key('keydown','KeyW');assert(!controls.read().forward);
});
