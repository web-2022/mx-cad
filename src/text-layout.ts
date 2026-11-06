/** MTEXT word wrapping in authored width, without truncation or shrinking. */
export function wrapText(text:string,width:number,measure:(s:string)=>number):string[]{
 if(!(width>0))return text.split(/\r?\n/);const lines:string[]=[];
 for(const paragraph of text.split(/\r?\n/)){let line='';for(const word of paragraph.split(/(\s+)/)){if(line&&line.trim()&&measure(line+word)>width){lines.push(line.trimEnd());line=word.trimStart();}else line+=word;}lines.push(line.trimEnd());}return lines;
}
