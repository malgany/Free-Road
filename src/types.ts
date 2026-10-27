export type Point = [number, number]; // x east, z south, metres after uniform scale
export type Ring = Point[];
export type Polygon = Ring[]; // outer, then holes
export type MultiPolygon = Polygon[];
export interface Road { id:string; name:string; kind:string; nodes:number[]; points:Point[]; width:number; layer:number; bridge:boolean; tunnel:boolean; surface:string }
export interface Area { id:string; kind:'building'|'water'|'grass'|'dirt'|'forest'; polygons:MultiPolygon; height:number; layer:number; synthetic?:boolean }
export interface Place {id:string;name:string;kind:string;point:Point}
export interface Rock {id:string; x:number; z:number; radius:number; synthetic:true}
export interface GameMap {
  schemaVersion:1; name:string; origin:{lat:number;lon:number}; bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  provenance:Record<string,unknown>; seed:number; roads:Road[]; corridors:{layer:number; polygons:MultiPolygon}[];
  graph:{nodes:Record<string,Point>;edges:{from:string;to:string;road:string}[]}; areas:Area[]; rocks:Rock[];
  spawn:{x:number;z:number;heading:number}; adaptation:{scale:number;maxBuildingHeight:number;roadWidths:Record<string,number>}; diagnostics:string[];
  places?:Place[];
}
export interface Input {forward:boolean;backward:boolean;left:boolean;right:boolean; brake?:boolean}
export interface CarState {x:number;z:number;heading:number;vx:number;vz:number;steer:number;speed:number;distance:number;contact:string|null}
export const EMPTY_INPUT:Input = {forward:false,backward:false,left:false,right:false};
