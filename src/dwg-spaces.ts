import {recoverOleImage} from './ole-bitmap';
import type { CadDocument, CadEntity } from './vendor/cad/index';
import {list,record,separateDrawingSpaces} from './drawing-spaces';

export function completeDwgDocument(doc:CadDocument,raw:unknown){
  const db=record(raw),objects=record(db.objects),tables=record(db.tables);
  const blocks=list(record(tables.BLOCK_RECORD).entries??db.blocks);
  const all=[...doc.entities,...Object.values(doc.blocks).flatMap(b=>b.entities)];
  for(const e of all){const r={...record(e.raw),...e};
    if(typeof r.transparency==='number'&&Number(r.transparencyType)===3)e.opacity=Math.max(0,Math.min(1,r.transparency/255));
    if(e.type==='HATCH'){
      e.boundaryPaths=r.boundaryPaths;e.definitionLines=r.definitionLines;e.solidFill=r.solidFill;e.hatchStyle=r.hatchStyle;e.patternName=r.patternName;e.gradientFlag=r.gradientFlag;
    }
    if(['SOLID','TRACE','3DFACE'].includes(e.type)&&!e.vertices?.length){const v=[r.corner1,r.corner2,r.corner3,r.corner4].filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));if(v.length>=3)e.vertices=v;}
    if(e.type==='OLE2FRAME'){try{recoverOleImage(e,r);}catch(error){doc.warnings.push('No se recuperó la imagen OLE '+String(e.handle??'')+': '+String(error));}}
    if(e.type==='IMAGE'){e.imageDefId=r.imageDefHandle??r.imageDefId??r.imageDef??r.imageDefReference;e.imageU=r.uVector??r.uPixel;e.imageV=r.vVector??r.vPixel;e.imagePixelSize=r.imageSize??r.size;}
    const block=blocks.find(b=>b.name===r.name||b.handle===(r.blockId??r.geometryBlockId));
    if(e.type.startsWith('DIMENSION')&&block){e.kind='insert';e.blockName=block.name;e.insertionPoint={x:0,y:0};e.rotation=0;}
  }
  doc.metadata.mxImageDefs=list(objects.IMAGEDEF);
  doc.metadata.mxTextStyles=list(record(tables.STYLE).entries).map(s=>({...s,fontFile:s.fontFile??s.font??s.fontFileName,bigFontFile:s.bigFontFile??s.bigFont??s.bigFontFileName}));
  separateDrawingSpaces(doc,list(objects.LAYOUT),blocks);
  // Preserve reference metadata even if the upstream normalizer omitted block flags.
  for(const b of blocks)if(doc.blocks[b.name])doc.blocks[b.name].raw=b;
}
