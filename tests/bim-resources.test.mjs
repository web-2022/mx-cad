import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceKey,modelFormat} from '../src/bim-types.ts';
test('local glTF resource paths are decoded; remote references and traversal are rejected',()=>{
  assert.equal(resourceKey('./textures/pared%20blanca.png'),'textures/pared blanca.png');
  for(const uri of ['https://example.com/a.bin','//example.com/a.bin','../secret.bin','%2e%2e/secret.bin','file:///etc/passwd','C:\\file.bin'])assert.throws(()=>resourceKey(uri));
  assert.equal(modelFormat('PLANO.IFC'),'ifc');
});
