/** Inspect dimensions before any client decodes the compressed image. No decoder runs here. */
export function safeJpeg(bytes:Uint8Array) {
  if(bytes.length<12 || bytes[0]!==255 || bytes[1]!==216)return false;
  let offset=2;
  let dimensions=false;
  while(offset<bytes.length) {
    if(bytes[offset++]!==255)return false;
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===217)return dimensions;
    if(marker===218)return dimensions && bytes.at(-2)===255 && bytes.at(-1)===217;
    if(marker===undefined || marker===0)return false;
    if(marker===1 || marker>=208 && marker<=215)continue;
    if(offset+2>bytes.length)return false;
    const length=bytes[offset]*256+bytes[offset+1];
    if(length<2 || offset+length>bytes.length)return false;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      if(length<8)return false;
      const height=bytes[offset+3]*256+bytes[offset+4],width=bytes[offset+5]*256+bytes[offset+6];
      if(!width || !height || width>4096 || height>4096 || width*height>16000000)return false;
      dimensions=true;
    }
    offset+=length;
  }
  return false;
}
