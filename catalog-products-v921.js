/* Supplier rows retain their IDs; only the visible product card is shared. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WorktimeCatalogProducts=api;})(globalThis,function(){
 'use strict';
 function gtin(raw){const s=String(raw??'').trim();if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)||/^0+$/.test(s))return null;let sum=0;for(let i=s.length-2,j=0;i>=0;i--,j++)sum+=Number(s[i])*(j%2?1:3);return (sum+Number(s.at(-1)))%10?null:s.padStart(14,'0');}
 const name=m=>m.catalog_product_name||m.name;
 function groups(rows){
  const parent=new Map(rows.map(m=>[m.id,m.id])),byId=new Map(rows.map(m=>[m.id,m])),tokens=new Map();
  const find=id=>{let p=parent.get(id);while(p!==parent.get(p))p=parent.get(p);while(id!==p){const next=parent.get(id);parent.set(id,p);id=next;}return p;};
  const join=(a,b)=>{if(a.business_id===b.business_id&&(a.unit||'Stk')===(b.unit||'Stk')){const x=find(a.id),y=find(b.id);parent.set(x<y?y:x,x<y?x:y);}};
  for(const m of rows){const target=byId.get(m.catalog_product_id);if(target)join(m,target);const g=gtin(m.catalog_gtin);if(g){const key=JSON.stringify([m.business_id,m.unit||'Stk',g]);if(tokens.has(key))join(m,tokens.get(key));else tokens.set(key,m);}}
  const out=new Map();for(const m of rows){const id=find(m.id);if(!out.has(id))out.set(id,{id,name:name(byId.get(id)),unit:m.unit||'Stk',members:[]});out.get(id).members.push(m);}return [...out.values()];
 }
 function decorate({root,materials,api,businessId,reload,render,isManager}){
  if(!materials.some(m=>Object.hasOwn(m,'catalog_gtin')))return;
  const productGroups=groups(materials),cardsById=new Map([...root.querySelectorAll('[data-action="edit-material"]')].map(b=>[b.dataset.id,b.closest('.row-card')]));
  for(const group of productGroups){
   const cards=group.members.map(m=>({m,card:cardsById.get(m.id)})).filter(x=>x.card);
   if(!cards.length||cards[0].card.closest('[data-product-card]'))continue;
   const wrapper=document.createElement('section');wrapper.className='panel catalog-product-card';wrapper.dataset.productCard=group.id;
   const title=document.createElement('h3');title.textContent=globalThis.WorktimeProductDisplay?.displayName(cards[0].m)||name(cards[0].m);wrapper.append(title);
   const text=document.createElement('p');text.textContent=cards.length+' Händlerangebot'+(cards.length===1?'':'e')+' · Preise netto je '+group.unit;wrapper.append(text);
   cards[0].card.before(wrapper);
   for(const {m,card}of cards){const heading=card.querySelector('b,strong');if(heading)heading.textContent=m.catalog_supplier||name(m);wrapper.append(card);}
   if(isManager()){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Mit einem vorhandenen Artikel zusammenfassen';details.append(summary);
    const hint=document.createElement('p');hint.textContent='Nur denselben Artikel mit gleicher Ausführung und Verkaufseinheit zuordnen. Preise und Händler bleiben getrennt.';details.append(hint);
    const select=document.createElement('select');select.setAttribute('aria-label','Gemeinsamen Artikel auswählen');select.append(new Option('Bitte Zielartikel auswählen',''));
    const ownGtins=new Set(group.members.map(m=>gtin(m.catalog_gtin)).filter(Boolean));
    details.addEventListener('toggle',()=>{if(!details.open||select.options.length>1)return;for(const target of productGroups){if(target.id===group.id||target.unit!==group.unit)continue;const all=new Set([...ownGtins,...target.members.map(m=>gtin(m.catalog_gtin)).filter(Boolean)]);if(all.size>1)continue;select.append(new Option(target.name+' · '+target.members.map(m=>m.catalog_supplier||'ohne Händler').join(', '),target.members[0].id));}});
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Als denselben Artikel zusammenfassen';const status=document.createElement('p');status.setAttribute('role','status');
    button.addEventListener('click',async()=>{if(!select.value||!isManager())return;const company=businessId(),item=cards[0].m;button.disabled=true;try{const result=await api('/rest/v1/rpc/link_catalog_product_v921',{method:'POST',body:{p_company:company,p_material:item.id,p_target:select.value,p_revision:item.catalog_revision}});if(businessId()!==company)return;if(String(result?.company_id)!==String(company)||!result.product_id)throw Error('Zuordnung nicht bestätigt. Bitte neu laden.');await reload();render();}catch(e){if(businessId()===company){status.textContent=e.message||'Zuordnung nicht bestätigt.';button.disabled=false;}}});details.append(select,button,status);wrapper.append(details);
   }
  }
  syncVisibility(root);
 }
 function syncVisibility(root){let visible=0,total=0;for(const card of root.querySelectorAll('[data-product-card]')){total++;const offers=[...card.querySelectorAll('[data-material-catalog-card]')];card.hidden=!offers.some(c=>!c.hidden);if(!card.hidden){visible++;offers.forEach(c=>c.hidden=false);}}const count=root.querySelector('[data-material-search-count]');if(total&&count)count.textContent=visible+' von '+total+' Artikeln · Händlerangebote jeweils unter dem Artikel';}
 return Object.freeze({gtin,name,groups,decorate,syncVisibility});
});
