import {test} from 'node:test';import assert from 'node:assert/strict';
import {diagnostics,diagnosticSummary} from '../src/import-diagnostics.ts';
import {renderPixelRatio} from '../src/render-quality.ts';
test('diagnostics retain SHX resources, deduplicate notices and distinguish missing from unsupported',()=>{
 const items=diagnostics(['Falta fuente: romans.shx.','Falta fuente: romans.shx.','Falta estilo de impresión: plano.ctb.','No compatible: ACIS','Aproximado: MTEXT','Error del lector']);
 assert.deepEqual(diagnosticSummary(items),{resources:2,approximate:1,unsupported:1,reader:1});
 assert.match(items[0].action,/fuente original/);assert.match(items[1].action,/CTB/);assert.match(items[2].action,/puede faltar/);
});
test('navigation quality lowers only raster resolution and restores native resolution for high quality',()=>{
 assert.equal(renderPixelRatio(2,'auto',true),.75);assert.equal(renderPixelRatio(2,'auto',false),2);
 assert.equal(renderPixelRatio(1,'high',true),1);assert.equal(renderPixelRatio(1,'fast',false),.75);
 assert.equal(renderPixelRatio(NaN,'high',false),1);
});
