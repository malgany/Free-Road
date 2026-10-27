import {clamp} from './geometry';
export const DAY_SECONDS=600, TWILIGHT_SECONDS=90, NIGHT_SECONDS=300;
export const CYCLE_SECONDS=DAY_SECONDS+TWILIGHT_SECONDS*2+NIGHT_SECONDS;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export function gameClock(seconds:number){
  const t=((seconds%CYCLE_SECONDS)+CYCLE_SECONDS)%CYCLE_SECONDS;
  const minutes=t<600?360+t/600*720:t<690?1080+(t-600)/90*120:t<990?1200+(t-690)/300*480:1680+(t-990)/90*120;
  const total=Math.floor(minutes)%1440;return `${Math.floor(total/60).toString().padStart(2,'0')}:${(total%60).toString().padStart(2,'0')}`;
}
export function daylightAt(seconds:number){
  const t=((seconds%CYCLE_SECONDS)+CYCLE_SECONDS)%CYCLE_SECONDS;
  let daylight=1,phase='Dia',angle=0.2+Math.PI*0.8*t/DAY_SECONDS;
  if(t>=DAY_SECONDS&&t<DAY_SECONDS+TWILIGHT_SECONDS){const u=(t-DAY_SECONDS)/TWILIGHT_SECONDS;daylight=1-smooth(u);phase='Entardecer';angle=Math.PI*(0.8+0.25*u)+0.2;}
  else if(t>=DAY_SECONDS+TWILIGHT_SECONDS&&t<DAY_SECONDS+TWILIGHT_SECONDS+NIGHT_SECONDS){daylight=0;phase='Noite';angle=Math.PI*1.3;}
  else if(t>=DAY_SECONDS+TWILIGHT_SECONDS+NIGHT_SECONDS){const u=(t-DAY_SECONDS-TWILIGHT_SECONDS-NIGHT_SECONDS)/TWILIGHT_SECONDS;daylight=smooth(u);phase='Amanhecer';angle=-0.15+0.35*u;}
  return {daylight,phase,angle,headlights:1-smooth((daylight-0.15)/0.6)};
}
