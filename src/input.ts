import {EMPTY_INPUT,type Input} from './types';
export class Controls {
  keys=new Set<string>();touch=new Set<string>();enabled=false;
  constructor(public onPause:(reason:'key'|'blur')=>void,public onReset:()=>void){
    const allowed=['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];
    window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
      if(allowed.includes(e.code)&&this.enabled){e.preventDefault();this.keys.add(e.code);}if(!e.repeat&&e.code==='KeyR')onReset();if(!e.repeat&&e.code==='Escape')onPause('key');});
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>{this.clear();if(this.enabled)onPause('blur');});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();if(this.enabled)onPause('blur');}});
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-drive]')){
      const key=button.dataset.drive!;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(this.enabled)this.touch.add(key);});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>this.touch.delete(key));
    }
  }
  clear(){this.keys.clear();this.touch.clear();}
  read():Input{if(!this.enabled)return {...EMPTY_INPUT};const has=(...keys:string[])=>keys.some(k=>this.keys.has(k)||this.touch.has(k));return {forward:has('KeyW','ArrowUp'),backward:has('KeyS','ArrowDown'),left:has('KeyA','ArrowLeft'),right:has('KeyD','ArrowRight'),brake:has('Space')};}
}
