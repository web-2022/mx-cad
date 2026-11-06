import type {CadEntity} from './vendor/cad/core/types';
export type ColorEdit={mode:'BYLAYER'|'BYBLOCK'|'EXPLICIT';value?:string};
const keys=['color','trueColor','colorIndex','colorNumber','colorName','aci','true_color','truecolor','colorRGB','colorRgb','rgbColor','rgb'] as const;
export class EntityEdits {
  readonly changes=new Map<CadEntity,ColorEdit>();
  private originals=new Map<CadEntity,Record<string,unknown>>();
  private undoStack:{entity:CadEntity;before?:ColorEdit;after:ColorEdit}[]=[];
  private redoStack:typeof this.undoStack=[];
  original(e:CadEntity){return this.originals.get(e);}
  private apply(e:CadEntity,change?:ColorEdit){
    const original=this.originals.get(e)!;for(const k of keys)delete e[k];Object.assign(e,original);
    if(change){for(const k of keys)delete e[k];if(change.mode==='EXPLICIT'){e.trueColor=parseInt(change.value!.slice(1),16);e.color=change.value;}else e.colorIndex=change.mode==='BYBLOCK'?0:256;this.changes.set(e,change);}else this.changes.delete(e);
  }
  set(e:CadEntity,change:ColorEdit){
    if(change.mode==='EXPLICIT'&&!/^#[0-9a-f]{6}$/i.test(change.value??''))throw Error('Color inválido');
    if(!this.originals.has(e))this.originals.set(e,Object.fromEntries(keys.filter(k=>Object.hasOwn(e,k)).map(k=>[k,e[k]])));
    this.undoStack.push({entity:e,before:this.changes.get(e),after:{...change}});this.redoStack=[];this.apply(e,change);
  }
  undo(){const step=this.undoStack.pop();if(!step)return false;this.apply(step.entity,step.before);this.redoStack.push(step);return true;}
  redo(){const step=this.redoStack.pop();if(!step)return false;this.apply(step.entity,step.after);this.undoStack.push(step);return true;}
  get canUndo(){return !!this.undoStack.length;} get canRedo(){return !!this.redoStack.length;}
  reset(){this.changes.clear();this.originals.clear();this.undoStack=[];this.redoStack=[];}
}
