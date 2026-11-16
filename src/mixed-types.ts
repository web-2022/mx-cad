import type {Blocks} from './block-data';
import type {CadDocument} from './vendor/cad/core/types';
export interface SceneFile {id:string;name:string;opacity:number;color?:string;}
export interface SceneCad extends SceneFile {doc:CadDocument;}
export interface SceneBlocks extends SceneFile {model:Blocks;state:any;}
export interface MixedInput {cad:SceneCad[];blocks:SceneBlocks[];active:string;}
export interface SceneSetting {visible:boolean;opacity:number;color:string|null;}
export interface MixedState {active:string;origin:number[];settings:Record<string,SceneSetting>;}
export interface Bounds3 {min:number[];max:number[];}
