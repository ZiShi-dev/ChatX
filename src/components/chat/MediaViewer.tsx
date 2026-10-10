import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { dismissOverlayHistory, useOverlayHistory } from '../../lib/overlayBack';
import { IonIcon, IonModal } from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { addOutline, removeOutline, arrowUndoOutline, bookmark, bookmarkOutline, chevronBackOutline, chevronForwardOutline, closeOutline, downloadOutline, expandOutline, informationCircleOutline, refreshOutline, shareSocialOutline, albumsOutline } from 'ionicons/icons';
import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import { useAuthStore } from '../../stores/authStore';
import { useSavedStore } from '../../stores/savedStore';
import { conversationTitle, formatNotificationTime } from '../../lib/conversation';
import { formatBytes } from '../../lib/media';
import { toSavedEntry } from '../../lib/saved';
import { mediaFile, exportMedia } from '../../lib/mediaExport';
import type { Message } from '../../types/message';
import './MediaViewer.css';

export default function MediaViewer({ messageId, conversationId, onClose }: { messageId:string; conversationId:string; onClose:()=>void }) {
  const messages = useChatStore((state) => state.messages);
  const users = useUserStore((state) => state.users);
  const me = useAuthStore((state) => state.currentUser.id);
  const saved = useSavedStore((state) => state.entries);
  const items = messages.filter((item) => item.conversationId === conversationId && !item.deletedForEveryone && (item.type === 'image' || item.type === 'video'));
  const [currentId,setCurrentId] = useState(messageId);
  const index = items.findIndex((item) => item.id === currentId);
  const current = items[index];
  const source = current?.media?.localPreviewUrl;
  const ready = current?.media?.state === 'cached' && !!source;
  const image = current?.type === 'image';
  const playable = ready && !image && !source?.endsWith('.svg') && !source?.startsWith('data:image/');
  const [scale,setScale] = useState(1);
  const [rotation,setRotation] = useState(0);
  const [position,setPosition] = useState({x:0,y:0});
  const [chrome,setChrome] = useState(true);
  const [info,setInfo] = useState(false);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [file,setFile] = useState<File | null>(null);
  const [failed,setFailed] = useState(false);
  const [speed,setSpeed] = useState(1);
  const stage = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [size,setSize] = useState({width:0,height:0});
  const stageRef = useCallback((node:HTMLDivElement | null) => {
    observer.current?.disconnect();stage.current=node;
    if(node){observer.current=new ResizeObserver(()=>{const width=node.clientWidth,height=node.clientHeight;setSize((old)=>old.width===width&&old.height===height?old:{width,height});});observer.current.observe(node);}
  },[]);
  useEffect(()=>()=>observer.current?.disconnect(),[]);
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const points = useRef(new Map<number,{x:number;y:number}>());
  const gesture = useRef({x:0,y:0,moved:false,pinched:false});
  const sender = users.find((user) => user.id === current?.senderId)?.displayName ?? 'عضو';
  const reset = () => { setScale(1);setPosition({x:0,y:0}); };
  const move = (step:number) => { const next = items[index+step]; if (next) setCurrentId(next.id); };
  const zoom = (value:number) => { setScale(Math.max(1,Math.min(5,value)));if(value<=1)setPosition({x:0,y:0}); };

  useEffect(() => {
    reset();setRotation(0);setInfo(false);setNotice('');setChrome(true);setFile(null);setFailed(false);setSpeed(1);points.current.clear();
    let alive = true;
    if(current && ready && (image || playable)) void mediaFile(current).then((value)=>{if(alive)setFile(value);}).catch(()=>{if(alive)setNotice('تعذر تجهيز الملف. حاول إعادة تحميله.');});
    return () => {alive=false;video.current?.pause();};
  },[currentId,source,ready]);
  useEffect(() => {
    if(!current)onClose();
  },[!!current,onClose]);
  useEffect(() => {
    const key = (event:KeyboardEvent) => {
      if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)return;
      if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
      if(event.key==='ArrowRight'){event.preventDefault();move(1);}
      if(image && (event.key==='+'||event.key==='=')){event.preventDefault();zoom(scale+.5);}
      if(image && event.key==='-'){event.preventDefault();zoom(scale-.5);}
      if(event.key==='0')reset();
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[index,items.length,scale,image]);

  const pointerDown = (event:PointerEvent<HTMLDivElement>) => {
    if(!image || !ready || event.button!==0)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(points.current.size===1)gesture.current={x:event.clientX,y:event.clientY,moved:false,pinched:false};
    else gesture.current.pinched=true;
  };
  const pointerMove = (event:PointerEvent<HTMLDivElement>) => {
    const previous=points.current.get(event.pointerId);if(!previous)return;
    const before=[...points.current.values()];
    points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const after=[...points.current.values()];
    if(Math.hypot(event.clientX-gesture.current.x,event.clientY-gesture.current.y)>8)gesture.current.moved=true;
    if(before.length===2){
      const distance=(values:typeof before)=>Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
      const old=distance(before);if(old>0)setScale((value)=>Math.max(1,Math.min(5,value*distance(after)/old)));
    }else if(scale>1){
      const bounds=stage.current?.getBoundingClientRect();
      const maxX=(bounds?.width??300)*(scale-1)/2,maxY=(bounds?.height??400)*(scale-1)/2;
      setPosition((value)=>({x:Math.max(-maxX,Math.min(maxX,value.x+event.clientX-previous.x)),y:Math.max(-maxY,Math.min(maxY,value.y+event.clientY-previous.y))}));
    }
  };
  const pointerUp = (event:PointerEvent<HTMLDivElement>) => {
    if(!points.current.has(event.pointerId))return;
    points.current.delete(event.pointerId);
    if(scale<=1)setPosition({x:0,y:0});
    if(event.type==='pointercancel')return;
    if(!points.current.size && !gesture.current.pinched && scale===1){
      const dx=event.clientX-gesture.current.x,dy=event.clientY-gesture.current.y;
      if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*1.5)move(dx<0?1:-1);
      else if(Math.abs(dy)>110 && Math.abs(dy)>Math.abs(dx)*1.5)onClose();
    }
  };
  const action = async (share=false) => {
    if(!file || busy)return;
    setBusy(true);setNotice('');
    try{ const result=await exportMedia(file,share);if(result==='saved')setNotice(Capacitor.getPlatform()==='android'?'تم حفظ الملف على الجهاز.':'بدأ تنزيل الملف.'); }
    catch(error){if(!(error instanceof Error && error.name==='AbortError'))setNotice(share?'تعذر مشاركة الملف. يمكنك تنزيله بدلًا من ذلك.':'تعذر حفظ الملف. تحقق من المساحة المتاحة ثم أعد المحاولة.');}
    finally{setBusy(false);}
  };
  const keep = () => {
    if(!current)return;
    const conversation=useChatStore.getState().conversations.find((item)=>item.id===conversationId);if(!conversation)return;
    const entry=toSavedEntry(current,me,conversationTitle(conversation,me,users),sender);if(entry)useSavedStore.getState().toggle(entry);
  };
  const fullscreen = async () => {
    try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen();}
    catch{setNotice('ملء الشاشة غير متاح في هذا المتصفح.');}
  };
  const pictureInPicture = async () => {
    try { if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.current?.requestPictureInPicture(); }
    catch {setNotice('تعذر فتح الفيديو في نافذة عائمة.');}
  };
  const end = useCallback(() => {
    video.current?.pause();
    if (document.fullscreenElement === root.current) void document.exitFullscreen();
    onClose();
  }, [onClose]);
  useOverlayHistory(Boolean(current), end);
  const close = () => {
    if (window.history.state?.chatxOverlay) dismissOverlayHistory();
    else end();
  };
  const isSaved=saved.some((item)=>item.userId===me && item.messageId===currentId);
  const canShare=!!file && (Capacitor.getPlatform()==='android' || !!navigator.canShare?.({files:[file]}));
  if(!current)return null;
  return <IonModal isOpen canDismiss className="media-viewer-modal" onDidDismiss={() => {
    if (window.history.state?.chatxOverlay) dismissOverlayHistory();
    else end();
  }} aria-label="عارض الوسائط">
    <div ref={root} className={`media-viewer ${chrome?'':'hide-chrome'}`} dir="rtl" onPointerDown={(event)=>event.stopPropagation()} onPointerMove={(event)=>event.stopPropagation()} onPointerUp={(event)=>event.stopPropagation()} onClick={(event)=>event.stopPropagation()} onContextMenu={(event)=>event.stopPropagation()}>
      <header className="mv-header">
        <button type="button" onClick={close} aria-label="إغلاق العارض"><IonIcon icon={closeOutline}/></button>
        <div className="mv-author"><strong>{sender}</strong><time>{formatNotificationTime(current.createdAt)}</time></div>
        <div className="mv-actions">
          <button type="button" disabled={!file||busy} onClick={()=>void action()} aria-label="تنزيل على الجهاز"><IonIcon icon={downloadOutline}/></button>
          {canShare&&<button type="button" disabled={busy} onClick={()=>void action(true)} aria-label="مشاركة الملف"><IonIcon icon={shareSocialOutline}/></button>}
          <button type="button" onClick={keep} aria-label={isSaved?'إزالة من المحفوظات':'حفظ لي فقط'} aria-pressed={isSaved}><IonIcon icon={isSaved?bookmark:bookmarkOutline}/></button>
          <button type="button" onClick={()=>{useChatStore.getState().beginReply(currentId);close();}} aria-label="الرد على الرسالة"><IonIcon icon={arrowUndoOutline}/></button>
          <button type="button" onClick={()=>setInfo(!info)} aria-label="معلومات الملف" aria-expanded={info}><IonIcon icon={informationCircleOutline}/></button>
        </div>
      </header>
      <div ref={stageRef} className={`mv-stage ${image?'is-image':''} ${scale>1?'is-zoomed':''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        onDoubleClick={()=>{if(image)zoom(scale>1?1:2);}}
        onClick={(event)=>{if(event.target instanceof HTMLImageElement&&!gesture.current.moved&&!gesture.current.pinched)setChrome((value)=>!value);}}
        onWheel={(event)=>{if(image&&ready){zoom(scale+(event.deltaY<0?.25:-.25));}}}>
        {ready&&!failed ? image ? <img draggable={false} src={source} alt={current.text||'الصورة في المحادثة'} onError={()=>setFailed(true)} style={{width:rotation%180?size.height:undefined,height:rotation%180?size.width:undefined,maxWidth:rotation%180?'none':undefined,maxHeight:rotation%180?'none':undefined,flexShrink:0,transform:`translate(${position.x}px,${position.y}px) rotate(${rotation}deg) scale(${scale})`}}/> : playable ? <video ref={video} key={currentId} src={source} controls playsInline preload="metadata" onError={()=>setFailed(true)}/> : <p className="mv-placeholder">لا يوجد ملف فيديو قابل للتشغيل لهذا المقطع.</p> : <div className="mv-placeholder">
          <p>{failed?'تعذر عرض الملف.':current.downloadFailed?'تعذر تنزيل الملف.':'هذا الملف لم يُحمّل على الجهاز.'}</p>
          {current.media?.state==='downloading'?<p role="status">جارٍ التنزيل… {current.downloadProgress??0}%</p>:<button type="button" onClick={()=>{setFailed(false);useChatStore.getState().downloadMedia(currentId);}}>تنزيل {formatBytes(current.media?.fileSize??0)}</button>}
        </div>}
      </div>
      {index>0&&<button type="button" className="mv-prev mv-nav" onClick={()=>move(-1)} aria-label="الوسيط السابق"><IonIcon icon={chevronBackOutline}/></button>}
      {index<items.length-1&&<button type="button" className="mv-next mv-nav" onClick={()=>move(1)} aria-label="الوسيط التالي"><IonIcon icon={chevronForwardOutline}/></button>}
      {info&&<aside className="mv-info"><strong>معلومات الملف</strong><span>{current.media?.fileName|| (image?'صورة':'فيديو')}</span><span dir="ltr">{formatBytes(current.media?.fileSize??0)}{current.media?.width&&current.media?.height?` · ${current.media.width} × ${current.media.height}`:''}</span><span>من {sender}</span><time>{formatNotificationTime(current.createdAt)}</time><small>الحفظ في المحفوظات خاص بك. التنزيل يحفظ نسخة على الجهاز.</small></aside>}
      <footer className="mv-footer">
        {notice&&<p className="mv-notice" role="status">{notice}</p>}
        {current.text&&<p className="mv-caption">{current.text}</p>}
        <div className="mv-tools">
          {image&&ready&&<><button type="button" aria-label="تصغير" disabled={scale<=1} onClick={()=>zoom(scale-.5)}><IonIcon icon={removeOutline}/></button><button type="button" onClick={reset} aria-label="إعادة ضبط التكبير">{Math.round(scale*100)}%</button><button type="button" aria-label="تكبير" disabled={scale>=5} onClick={()=>zoom(scale+.5)}><IonIcon icon={addOutline}/></button><button type="button" aria-label="تدوير الصورة" onClick={()=>{setRotation((value)=>(value+90)%360);reset();}}><IonIcon icon={refreshOutline}/></button></>}
          {playable&&<select aria-label="سرعة الفيديو" value={speed} onChange={(event)=>{const value=Number(event.target.value);setSpeed(value);if(video.current)video.current.playbackRate=value;}}>{[.5,1,1.5,2].map((value)=><option key={value} value={value}>{value}×</option>)}</select>}
          {playable&&document.pictureInPictureEnabled&&<button type="button" onClick={()=>void pictureInPicture()} aria-label="نافذة فيديو عائمة"><IonIcon icon={albumsOutline}/></button>}
          {typeof document.documentElement.requestFullscreen==='function'&&<button type="button" onClick={()=>void fullscreen()} aria-label="ملء الشاشة"><IonIcon icon={expandOutline}/></button>}
          <span className="mv-count" dir="ltr">{index+1} / {items.length}</span>
        </div>
        {items.length>1&&<div className="mv-filmstrip" dir="ltr" aria-label="وسائط المحادثة">{items.map((item)=><button type="button" key={item.id} aria-label={item.type==='image'?'عرض الصورة':'عرض الفيديو'} aria-current={item.id===currentId?'true':undefined} onClick={()=>setCurrentId(item.id)}>{item.type==='image'&&item.media?.state==='cached'&&item.media.localPreviewUrl?<img src={item.media.localPreviewUrl} alt="" loading="lazy"/>:<span>{item.type==='video'?'▶':'▧'}</span>}</button>)}</div>}
      </footer>
    </div>
  </IonModal>;
}
