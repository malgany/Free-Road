import {clamp} from './geometry';

export const CHASE_STOP=0.2;
/** A wheel gesture cannot skip the chase view, even with a large delta. */
export class CameraZoom {
  target=1; value=1; yaw=0; pitch=0; orthographic=false;
  private edgeSince=-Infinity; private edgePressure=0; private edgeDirection=0;
  private heldAt=-Infinity; private pressure=0; private direction=0;
  get mode(){return this.orthographic?'orthographic':this.value<0.025?'cockpit':this.value<=CHASE_STOP+0.025?'chase':'aerial';}
  select(mode:'aerial'|'chase'|'cockpit'|'orthographic'){
    this.orthographic=mode==='orthographic';this.target=mode==='cockpit'?0:mode==='chase'?CHASE_STOP:1;
    if(this.orthographic)this.value=1;this.center();this.edgePressure=0;this.edgeDirection=0;this.heldAt=-Infinity;this.pressure=0;
  }
  cycle(){const modes=['aerial','chase','cockpit','orthographic'] as const;const mode=this.orthographic?'orthographic':this.target<CHASE_STOP?'cockpit':this.target<=CHASE_STOP?'chase':'aerial';this.select(modes[(modes.indexOf(mode)+1)%4]);}
  wheel(delta:number,now:number){
    if(!Number.isFinite(delta)||!delta)return;
    const direction=Math.sign(delta),amount=Math.min(Math.abs(delta),120);
    if(this.orthographic||(this.target===1&&direction>0)){
      if(this.orthographic&&direction>0)return;
      if(this.edgeDirection!==direction||now-this.edgeSince>2200){this.edgeSince=now;this.edgePressure=0;this.edgeDirection=direction;}
      this.edgePressure+=amount;
      if(now-this.edgeSince>=500&&this.edgePressure>=300){this.select(this.orthographic?'aerial':'orthographic');this.edgeSince=now;}
      return;
    }
    this.edgePressure=0;this.edgeDirection=0;
    if(this.target===CHASE_STOP){
      if(direction!==this.direction){this.pressure=0;this.heldAt=now;this.direction=direction;}
      this.pressure+=amount;
      if(now-this.heldAt<500||this.pressure<260)return;
    }
    const next=clamp(this.target+direction*amount*0.0009,0,1);
    if((this.target>CHASE_STOP&&next<=CHASE_STOP)||(this.target<CHASE_STOP&&next>=CHASE_STOP)){
      this.target=CHASE_STOP;this.heldAt=now;this.pressure=0;this.direction=direction;
    }else this.target=next;
  }
  update(dt:number){this.value+=(this.target-this.value)*(1-Math.exp(-10*dt));if(Math.abs(this.value-this.target)<0.0001)this.value=this.target;}
  look(dx:number,dy:number){this.yaw=clamp(this.yaw+dx*0.003,-1.55,1.55);this.pitch=clamp(this.pitch-dy*0.0025,-0.6,0.55);}
  center(){this.yaw=0;this.pitch=0;}
}
