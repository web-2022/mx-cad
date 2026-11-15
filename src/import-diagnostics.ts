export type DiagnosticGroup='resources'|'approximate'|'unsupported'|'reader';
export interface Diagnostic {group:DiagnosticGroup;message:string;action:string;}
export function diagnostics(messages:string[]):Diagnostic[]{
  return [...new Set(messages.map(s=>s.trim()).filter(Boolean))].map(message=>{
    const group:DiagnosticGroup=/^(falta|faltan)\b/i.test(message)?'resources':/^no compatible:/i.test(message)?'unsupported':/^(aproximado:|ctb:|tabla cad:)/i.test(message)?'approximate':'reader';
    const action=group==='resources'?(/fuente|shx/i.test(message)?'Carga la fuente original desde tu equipo.':/impresión|ctb|stb/i.test(message)?'Carga el estilo CTB declarado por la presentación.':'Carga la imagen o referencia local indicada.'):group==='unsupported'?'Compara con AutoCAD o un PDF de referencia; este contenido puede faltar.':group==='approximate'?'Compara la presentación con una referencia antes de emitir el plano.':'Consulta el aviso del lector; abrir el archivo no garantiza fidelidad completa.';
    return {group,message,action};
  });
}
export function diagnosticSummary(items:Diagnostic[]){return {resources:items.filter(i=>i.group==='resources').length,approximate:items.filter(i=>i.group==='approximate').length,unsupported:items.filter(i=>i.group==='unsupported').length,reader:items.filter(i=>i.group==='reader').length};}
