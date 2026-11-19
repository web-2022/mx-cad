/** DXF 440 explicit alpha (0x020000AA): 0 is transparent, 255 opaque.
 * Other modes (ByLayer/ByBlock) are inheritance, not explicit zero alpha.
 * https://ezdxf.mozman.at/docs/dxfinternals/dxftags.html
 */
export function dxfOpacity(value:unknown):number|undefined {
 if(value===undefined||value===null||value==='')return;
 const packed=Number(value);
 if(!Number.isInteger(packed)||packed<0||packed>0xffffffff||(packed>>>24)!==2)return;
 return (packed&255)/255;
}
