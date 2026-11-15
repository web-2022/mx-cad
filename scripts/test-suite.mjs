import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=readdirSync(new URL('../tests/',import.meta.url)).filter(f=>f.endsWith('.test.mjs')).sort();
for(const [name,group]of [['Proyecto',files.filter(f=>f.startsWith('project-'))],['Regresiones',files.filter(f=>!f.startsWith('project-'))]]){
 if(!group.length)continue;
 console.log('\n'+name);
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...group.map(f=>'tests/'+f)],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
