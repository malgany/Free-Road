import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {GameScene} from '../src/scene';import {CollisionWorld} from '../src/collision';import {makeTestMap} from '../src/test-map';import {initialState} from '../src/vehicle';

function effectsOnly(){
  // Exercise real instanced geometry without requiring a WebGL context in Node.
  const scene=Object.create(GameScene.prototype) as GameScene;
  Object.assign(scene,{world:new CollisionWorld(makeTestMap()),reduced:false,effectTick:0,trailIndex:0,dustIndex:0,lastTrail:null,matrix:new THREE.Object3D(),trailAges:new Float32Array(2048).fill(100),dustAges:new Float32Array(48).fill(100),dustPositions:Array.from({length:48},()=>new THREE.Vector3()),trail:new THREE.InstancedMesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial(),2048),dust:new THREE.InstancedMesh(new THREE.IcosahedronGeometry(),new THREE.MeshBasicMaterial(),48)});
  return scene;
}
test('grama, terra e chão neutro recebem dois rastros contínuos sem precisar frear',()=>{
  for(const [x,z] of [[35,30],[-30,-25],[85,20]]){
    const scene=effectsOnly(),s=initialState({x,z,heading:0});s.speed=10;scene.effects(s,0.1,false);s.z-=1;scene.effects(s,0.1,false);
    assert.equal(scene.trailIndex,2);assert.equal(scene.trailAges.filter(n=>n<90).length,2);
    const matrix=new THREE.Matrix4();scene.trail.getMatrixAt(0,matrix);const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();matrix.decompose(position,rotation,scale);
    assert(scale.z>1&&scale.z<1.1);assert(position.y>0.06);
    scene.effects(s,0,false);assert.equal(scene.trailIndex,2); // paused frames do not add marks
  }
});
test('asfalto só marca ao frear ou esterçar, e reset remove marcas antigas',()=>{
  const scene=effectsOnly(),s=initialState({x:-65,z:38,heading:0});s.speed=10;scene.effects(s,0.1,false);s.z-=1;scene.effects(s,0.1,false);assert.equal(scene.trailIndex,0);
  s.z-=1;scene.effects(s,0.1,true);assert.equal(scene.trailIndex,2);scene.clearEffects();assert.equal(scene.trailAges.filter(n=>n<90).length,0);assert.equal(scene.lastTrail,null);
});
test('mata recebe faixa da largura do carro, sem duplicar marcas de rodas',()=>{
 const scene=effectsOnly();scene.world.surfaceAt=()=> 'forest';
 const s=initialState({x:35,z:30,heading:0});s.speed=10;scene.effects(s,.1,false);s.z-=1;scene.effects(s,.1,false);
 assert.equal(scene.trailIndex,1);const m=new THREE.Matrix4();scene.trail.getMatrixAt(0,m);
 const p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();m.decompose(p,q,scale);
 assert(Math.abs(scale.x*.22-2.05)<.001);assert.equal(p.x,35);
});
