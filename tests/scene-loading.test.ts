import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {GameScene} from '../src/scene';import {makeTestMap} from '../src/test-map';import {CollisionWorld} from '../src/collision';
function stagedScene(){const s=Object.create(GameScene.prototype) as GameScene;Object.assign(s,{scene:new THREE.Scene(),worldGroup:new THREE.Group(),debug:new THREE.Group(),loadGeneration:0,debugEnabled:false,light:new THREE.DirectionalLight(),gradient:new THREE.DataTexture(new Uint8Array([100,200]),2,1,THREE.RedFormat)});s.scene.add(s.worldGroup,s.debug);return s;}
test('troca atômica libera malhas antigas e fachadas não recebem sombra que produz acne',async()=>{
  const scene=stagedScene(),map=makeTestMap(),old=scene.worldGroup;let disposed=false;const geo=new THREE.BoxGeometry();geo.addEventListener('dispose',()=>disposed=true);old.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial()));
  await scene.load(map,new CollisionWorld(map),true);assert(disposed);assert(!scene.scene.children.includes(old));assert(scene.scene.children.includes(scene.worldGroup));assert.equal(scene.worldGroup.children.filter(o=>o.userData.sector).length,1);for(const m of scene.worldGroup.children.filter(o=>o.userData.sector))assert.equal((m as THREE.Mesh).receiveShadow,false);
});
test('cancelamento ou posição ocupada preservam mapa e cena anteriores',async()=>{
  const scene=stagedScene(),map=makeTestMap(),old=scene.worldGroup,controller=new AbortController();controller.abort();await assert.rejects(scene.load(map,new CollisionWorld(map),true,controller.signal),{name:'AbortError'});assert.equal(scene.worldGroup,old);
  await assert.rejects(scene.load(map,new CollisionWorld(map),true,undefined,()=>false),/passagem livre/);assert.equal(scene.worldGroup,old);
});
