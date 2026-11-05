export class NavigationHistory {
  private states=new Map<string,unknown[]>();
  clear(){this.states.clear();}
  push(key:string,state:unknown){let a=this.states.get(key);if(!a){if(this.states.size>=12)this.states.delete(this.states.keys().next().value!);a=[];this.states.set(key,a);}const copy=structuredClone(state);if(JSON.stringify(a.at(-1))!==JSON.stringify(copy))a.push(copy);if(a.length>40)a.shift();}
  pop(key:string){return this.states.get(key)?.pop();}
  has(key:string){return !!this.states.get(key)?.length;}
}
