export type RenderQuality='auto'|'high'|'fast';
export function renderPixelRatio(deviceRatio:number,quality:RenderQuality,moving:boolean){
 const high=Math.min(Math.max(Number.isFinite(deviceRatio)?deviceRatio:1,1),2);
 return quality==='fast'||quality==='auto'&&moving?Math.min(high,.75):high;
}
