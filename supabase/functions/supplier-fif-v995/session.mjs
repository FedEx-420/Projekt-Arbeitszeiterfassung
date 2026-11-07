const te=new TextEncoder(),td=new TextDecoder();
const b64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
export function createCodec(secret,crypto=globalThis.crypto,now=Date.now){
 if(typeof secret!=='string'||secret.length<32)throw Error('FiF session encryption is not configured.');
 const key=crypto.subtle.importKey('raw',te.encode(secret),'HKDF',false,['deriveKey']).then(k=>crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:te.encode('worktime-fif-session-v995'),info:te.encode('session-only')},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']));
 const aad=c=>te.encode(JSON.stringify([c.owner,c.company,c.supplier]));
 return {async seal(data,c){const iv=crypto.getRandomValues(new Uint8Array(12));return 'fif1.'+b64(iv)+'.'+b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(c)},await key,te.encode(JSON.stringify(data)))));},async open(token,c){try{if(typeof token!=='string'||token.length>100000)throw Error();const [v,iv,body,...extra]=token.split('.');if(v!=='fif1'||extra.length||!iv||!body)throw Error();const s=JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:aad(c)},await key,unb64(body))));if(!Number.isFinite(s.expires)||s.expires<=now()||s.expires>now()+16*60000||!s.cookies||typeof s.username!=='string')throw Error();return s;}catch{throw Object.assign(Error('Bitte den FiF-Zugang erneut verbinden.'),{code:'RECONNECT',status:401});}}};
}
