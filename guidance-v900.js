import {helpTopic} from './help-topics-v900.js?v=907';
const root=document.getElementById('app');
const dialog=document.createElement('dialog');dialog.className='field-help-dialog';dialog.setAttribute('aria-label','Hilfe zur Eingabe');document.body.append(dialog);
let origin=null;
dialog.addEventListener('close',()=>{if(origin?.isConnected)origin.focus();});
function show(button){
 origin=button;const topic=helpTopic(button.dataset.helpName,button.dataset.helpLabel);dialog.replaceChildren();
 const title=document.createElement('h2');title.textContent=topic.title;dialog.append(title);
 for(const [caption,text]of [['Was eintragen?',topic.what],['Wofür wird es benötigt?',topic.why],['Wo erfragen?',topic.where]]){const h=document.createElement('h3'),p=document.createElement('p');h.textContent=caption;p.textContent=text;dialog.append(h,p);}
 if(topic.source){const a=document.createElement('a');a.href=topic.source;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Offizielle Information öffnen ↗';dialog.append(a);}
 const note=document.createElement('p');note.className='device-help';note.textContent='Orientierung, keine individuelle Steuer- oder Rechtsberatung.';dialog.append(note);
 const close=document.createElement('button');close.type='button';close.className='primary';close.textContent='Verstanden · zurück zur Eingabe';close.addEventListener('click',()=>dialog.close());dialog.append(close);dialog.showModal();
}
root?.addEventListener('click',event=>{const button=event.target.closest('.field-help-button');if(!button)return;event.preventDefault();event.stopPropagation();show(button);});
function scan(){
 for(const label of root?.querySelectorAll('label')||[]){
  if(label.querySelector('.field-help-button'))continue;
  const input=label.htmlFor?document.getElementById(label.htmlFor):label.querySelector('input,select,textarea');
  if(!input||!input.name||['hidden','checkbox','radio'].includes(input.type)||input.disabled)continue;
  const caption=[...label.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join('').trim()||input.getAttribute('aria-label')||input.name;
  const button=document.createElement('button');button.type='button';button.className='field-help-button';button.textContent='?';button.setAttribute('aria-label','Hilfe: '+caption);button.dataset.helpName=input.name||input.id;button.dataset.helpLabel=caption;
  if(!input.hasAttribute('aria-label'))input.setAttribute('aria-label',caption);
  label.classList.add('field-help-label');label.insertBefore(button,input.parentElement===label?input:null);
 }
}
let queued=false;if(root)new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan();});}).observe(root,{childList:true,subtree:true});scan();
