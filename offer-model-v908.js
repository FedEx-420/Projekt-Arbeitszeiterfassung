/* Offer snapshots. Catalog prices are read, never mutated by this module. */
(() => {
  'use strict';
  const fail = message => { throw new Error(message); };
  const number = value => Number(String(value ?? '').replace(',', '.'));
  const price = value => {
    const valueNumber = number(value);
    if (!Number.isFinite(valueNumber) || valueNumber < 0 || valueNumber > 1000000 || Math.abs(valueNumber * 100 - Math.round(valueNumber * 100)) > .00001) fail('Bitte einen Preis mit höchstens zwei Nachkommastellen eingeben.');
    return Math.round(valueNumber * 100) / 100;
  };
  const unitPrice=value=>{const n=number(value);if(!Number.isFinite(n)||n<0||n>1000000||Math.abs(n*10000-Math.round(n*10000))>.00001)fail('Bitte einen Einzelpreis mit höchstens vier Nachkommastellen eingeben.');return Math.round(n*10000)/10000;};
  function config(offer) {
    const source = offer.offer_config || {};
    return {version:908,kind:source.kind === 'fixed' ? 'fixed' : 'itemized',categories:structuredClone(source.categories || []),assignment:[...(source.assignment || [])],tax_choice:source.tax_choice ? structuredClone(source.tax_choice) : null,issuer:structuredClone(source.issuer || {})};
  }
  function visibleItems(offer) {
    const settings = config(offer);
    if (settings.kind === 'itemized') return offer.items.map(item => ({name:String(item.name || ''),quantity:number(item.quantity),price:unitPrice(item.unit_price),unit:item.unit || (item.kind === 'labor' ? 'H' : 'Stk'),kind:item.kind}));
    if (!settings.categories.length || settings.categories.length > 50) fail('Bitte mindestens eine und höchstens 50 Pauschalkategorien hinzufügen.');
    const ids = new Set();
    const rows = settings.categories.map(category => {
      const id = String(category.id || ''), name = String(category.name || '').trim();
      if (!/^[\w-]{1,64}$/.test(id) || ids.has(id) || !name || name.length > 160) fail('Bitte jede Pauschalkategorie eindeutig benennen.');
      ids.add(id); return {id,name,quantity:1,price:price(category.price),unit:'Pau',kind:'category'};
    });
    if (settings.assignment.length !== offer.items.length || settings.assignment.some(id => !ids.has(String(id)))) fail('Bitte jede interne Position einer Pauschalkategorie zuordnen.');
    return rows;
  }
  function tax(offer,calculator) {
    const settings = config(offer);
    if (!settings.tax_choice) fail('Bitte die Umsatzsteuer für dieses Angebot ausdrücklich prüfen.');
    return calculator(visibleItems(offer), settings.tax_choice);
  }
  function choiceFromTax(value) {
    if (value?.version !== 905 || !value.lines?.length || !['net','gross'].includes(value.basis)) fail('Ungültige Steuerangaben.');
    return {basis:value.basis,mode:value.lines[0].code,confirmed:true,overrides:Object.fromEntries(value.lines.map((row,index)=>[index,row.code])),reasons:Object.fromEntries((value.notes || []).map(row=>[row.code,row.detail || '']))};
  }
  function recommended(material,level) {
    const field = Number(level) === 2 ? 'recommended_price_2' : 'recommended_price_1';
    if (material?.[field] == null || material[field] === '') return null;
    return unitPrice(material[field]);
  }
  // A drag changes only a narrow band around the deliberately selected price.
  // The band is re-anchored by typing/selecting a price, never during a drag.
  function priceRange(value,decimals=4) {
    const factor=decimals===2?100:10000;
    const parsed=number(value),anchor=Math.min(1000000,Math.max(0,Number.isFinite(parsed)?parsed:0));
    const radius=Math.max(1,anchor*.1),round=value=>Math.round(value*factor)/factor;
    return {min:round(Math.max(0,anchor-radius)),max:round(Math.min(1000000,anchor+radius)),step:1/factor,value:round(anchor)};
  }
  function pricePreview(offer,index,calculator) {
    const settings=config(offer),item=offer.items[index],choice=settings.tax_choice;
    let taxIndex=index;
    if(settings.kind==='fixed')taxIndex=settings.categories.findIndex(category=>category.id===settings.assignment[index]);
    const code=choice?.overrides?.[taxIndex]||choice?.mode||'standard';
    const selected={basis:choice?.basis||'net',mode:code,confirmed:true,overrides:{},reasons:{...(choice?.reasons||{})}};
    // The preview is not a tax decision or a saved tax confirmation.
    if(code!=='standard'&&!selected.reasons[code])selected.reasons[code]='Unverbindliche Preisvorschau';
    const tax=calculator([{name:item.name||'Position',quantity:1,price:unitPrice(item.unit_price)}],selected);
    return {gross:tax.gross/100,rate:tax.lines[0].rate,provisional:!choice,basis:selected.basis};
  }
  function netEditDraft(offer,calculator) {
    const draft=structuredClone(offer),settings=config(offer);
    if(settings.tax_choice?.basis!=='gross')return {offer:draft,converted:false};
    const original=tax(offer,calculator),rateAt=index=>original.lines[index]?.rate;
    const netUnit=(value,rate)=>{
      if(!Number.isFinite(rate))fail('Die bisherigen Steuerangaben sind unvollständig. Bitte vor der Umstellung prüfen.');
      return Math.round(unitPrice(value)*100/(100+rate)*10000)/10000;
    };
    if(settings.kind==='fixed'){
      draft.items=draft.items.map((item,index)=>({...item,unit_price:netUnit(item.unit_price,rateAt(settings.categories.findIndex(category=>category.id===settings.assignment[index])))}));
      settings.categories=settings.categories.map((category,index)=>({...category,price:original.lines[index].net/100}));
    }else draft.items=draft.items.map((item,index)=>({...item,unit_price:netUnit(item.unit_price,rateAt(index))}));
    settings.tax_choice={...settings.tax_choice,basis:'net'};draft.offer_config=settings;
    return {offer:draft,converted:true,previousGross:original.gross/100,roundingDifference:(tax(draft,calculator).gross-original.gross)/100};
  }
  function publicModel(offer,calculator) {
    const value = tax(offer,calculator), rows = visibleItems(offer), settings = config(offer);
    return {kind:settings.kind,tax:value,rows:rows.map((row,index)=>({...row,tax:value.lines[index]}))};
  }
  const module = {config,visibleItems,tax,choiceFromTax,recommended,publicModel,price,unitPrice,priceRange,pricePreview,netEditDraft};
  if (typeof window !== 'undefined') window.WorktimeOfferModel = module;
  if (typeof exports !== 'undefined') Object.assign(exports,module);
})();
