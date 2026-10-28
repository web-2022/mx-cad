import { mkdir, writeFile } from 'node:fs/promises';
// Plano de demostración original, generado en unidades de dibujo.
const pairs = [];
function group(...values) { pairs.push(...values.map(String)); }
group(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
group(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 4);
for (const [name, color] of [['MUROS', 7], ['PUERTAS', 3], ['MOBILIARIO', 4], ['TEXTOS', 2]]) group(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
group(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
const line = (x1, y1, x2, y2, layer = 'MUROS') => group(0, 'LINE', 8, layer, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);
function rect(x, y, w, h, layer = 'MUROS') { line(x,y,x+w,y,layer); line(x+w,y,x+w,y+h,layer); line(x+w,y+h,x,y+h,layer); line(x,y+h,x,y,layer); }
rect(0, 0, 12000, 8000); rect(120, 120, 11760, 7760);
line(7000, 120, 7000, 3100); line(7000, 4000, 7000, 7880); line(7120, 120, 7120, 3100); line(7120, 4000, 7120, 7880);
line(7120, 4500, 11880, 4500); line(7120, 4620, 11880, 4620);
line(7000,3100,6100,3100,'PUERTAS'); group(0,'ARC',8,'PUERTAS',10,7000,20,3100,40,900,50,90,51,180);
rect(8200, 5700, 2300, 1600, 'MOBILIARIO'); rect(8200, 6850, 850, 450, 'MOBILIARIO'); rect(9650, 6850, 850, 450, 'MOBILIARIO');
rect(1200, 5400, 2400, 850, 'MOBILIARIO'); rect(1200, 4500, 850, 800, 'MOBILIARIO');
rect(2700, 3500, 1600, 900, 'MOBILIARIO'); group(0,'CIRCLE',8,'MOBILIARIO',10,9500,20,2200,40,650);
for (const [text,x,y,h] of [['SALA / COMEDOR',2200,2000,260],['DORMITORIO',7900,5000,240],['ESTUDIO',8400,1000,240],['MX CAD - PLANO DE EJEMPLO',0,-1000,280],['12000 x 8000 mm',0,-1450,190]]) group(0,'TEXT',8,'TEXTOS',10,x,20,y,40,h,1,text);
group(0,'ENDSEC',0,'EOF');
await mkdir('public', { recursive: true });
await writeFile('public/ejemplo.dxf', pairs.join('\n') + '\n');
