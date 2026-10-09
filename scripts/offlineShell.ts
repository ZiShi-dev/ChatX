import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Cache the installed app shell, not private API responses or unvisited media. */
export function offlineShell(): Plugin {
  const graphs = new Map<string, string[]>();
  const entries = new Set<string>();
  return {
    name: 'chatx-offline-shell', enforce: 'post',
    generateBundle(_options, bundle) {
      for (const [name,item] of Object.entries(bundle)) if (item.type === 'chunk') {
        graphs.set(name, item.imports); if (item.isEntry) entries.add(name);
      }
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      const source = String(html.source);
      const version = createHash('sha256').update(source).digest('hex').slice(0,16);
      const files = new Set<string>(['/index.html', '/assets/icon/icon.png']);
      const visit = (name: string) => {
        if (files.has('/'+name)) return;
        files.add('/'+name);
        for (const imported of graphs.get(name) ?? []) visit(imported);
      };
      // Include the static graph used to boot; lazy screens and emoji cache on demand.
      for (const name of entries) visit(name);
      // Ionic loads its shell components dynamically, including before registration.
      // Save these small runtime chunks so the installed UI can boot offline.
      for (const name of graphs.keys()) if (name.startsWith('assets/p-')) visit(name);
      for (const name of Object.keys(bundle)) if (name.startsWith('assets/compat-')) visit(name);
      for (const match of source.matchAll(/(?:src|href)=["']\/?(assets\/[^"']+\.(?:js|css))["']/g)) visit(match[1]!);
      this.emitFile({ type:'asset', fileName:'sw.js', source: `
const LEGACY=new URL(self.location.href).searchParams.get('legacy')==='1';
const SHELL='chatx-shell-${version}-'+(LEGACY?'legacy':'modern'), RUNTIME='chatx-static-${version}';
const ALL=${JSON.stringify([...files])};
const PRECACHE=ALL.filter(path=>!path.endsWith('.js')||(LEGACY?path.includes('-legacy-'):!path.includes('-legacy-')));
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  const html=await fetch('/index.html',{cache:'reload'});
  if(!html.ok)throw new Error('shell_unavailable');
  const text=await html.clone().text();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  const version=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('').slice(0,16);
  if(version!=='${version}')throw new Error('shell_version_changed');
  await cache.addAll(PRECACHE.filter(path=>path!=='/index.html').map(path=>new Request(path,{cache:'reload'})));
  await cache.put('/index.html',html);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  const shells=keys.filter(key=>key.startsWith('chatx-shell-'));
  await Promise.all(keys.filter(key=>(key.startsWith('chatx-shell-')&&!shells.slice(-2).includes(key))||(key.startsWith('chatx-static-')&&key!==RUNTIME)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{const cached=await (await caches.open(SHELL)).match('/index.html');return cached||fetch(request);})());return;
  }
  if(!url.pathname.startsWith('/assets/')||! /\\.(?:js|css|webp|png|svg|woff2?)$/.test(url.pathname))return;
  event.respondWith((async()=>{
    const shell=await caches.open(SHELL),runtime=await caches.open(RUNTIME);
    // These public files have identical bytes for every Origin; dev/proxy CORS Vary
    // headers must not prevent a module request from finding a prefetched asset.
    const cached=await shell.match(request,{ignoreVary:true})||await runtime.match(request,{ignoreVary:true});
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok){
      const copy=response.clone(),stored=response.clone();
      event.waitUntil((async()=>{
        const bytes=await copy.arrayBuffer();
        if(bytes.byteLength>1000000)return;
        await runtime.put(request,stored);
        const keys=await runtime.keys();
        for(const old of keys.slice(0,Math.max(0,keys.length-80)))await runtime.delete(old);
      })().catch(()=>undefined));
    }
    return response;
  })());
});
` });
    },
  };
}
