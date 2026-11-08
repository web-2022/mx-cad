import {readDatamine} from './datamine-reader';
self.onmessage=e=>{try{const model=readDatamine(e.data);const transfers=model.columns.flatMap(c=>c.data instanceof Float64Array?[c.data.buffer]:[]);transfers.push(model.positions.buffer,model.sizes.buffer);self.postMessage({model}, {transfer:transfers});}catch(error){self.postMessage({error:String(error)});}};
