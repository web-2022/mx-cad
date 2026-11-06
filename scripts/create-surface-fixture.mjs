import {writeFile} from 'node:fs/promises';
const g=[0,'SECTION',2,'HEADER',9,'$ACADVER',1,'AC1027',9,'$INSUNITS',70,6,0,'ENDSEC',0,'SECTION',2,'TABLES',0,'TABLE',2,'LAYER',70,2,0,'LAYER',2,'0',70,0,62,3,6,'CONTINUOUS',0,'LAYER',2,'REFERENCE',70,0,62,1,6,'CONTINUOUS',0,'ENDTAB',0,'ENDSEC',0,'SECTION',2,'ENTITIES'];
const p=[[0,0,0],[30,0,0],[30,20,0],[0,20,0],[0,0,60],[30,0,60],[30,20,60],[0,20,60]].map(([x,y,z])=>[500000+x,9000000+y,4800+z]);let handle=256;
for(const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){g.push(0,'3DFACE',5,(handle++).toString(16),8,'0',62,3);for(let i=0;i<4;i++)for(let k=0;k<3;k++)g.push(10+k*10+i,p[face[i]][k]);}
g.push(0,'LINE',5,'200',8,'REFERENCE',10,500000,20,9000000,30,4800,11,500030,21,9000020,31,4860,0,'POINT',5,'201',8,'REFERENCE',10,500015,20,9000010,30,4870,0,'3DSOLID',5,'BAD',8,'0',0,'ENDSEC',0,'EOF');await writeFile('tests/fixtures/surfaces.dxf',g.join('\n')+'\n');
