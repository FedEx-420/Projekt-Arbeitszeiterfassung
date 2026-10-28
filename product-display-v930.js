/* Only public manufacturer data; never send private article lists to a service. */
(function(root){
 'use strict';
 let entries=[],revision=0;
 const raw=m=>String(m.catalog_product_name||m.name||'');
 const gtin=value=>root.WorktimeCatalogProducts?.gtin(value);
 function expand(value){return String(value||'').replace(/Steckdosen-Kombin\./gi,'Steckdosenkombination').replace(/\bm\.\s*Rah\./gi,'mit Rahmen').replace(/\bAbdeckpl\./gi,'Abdeckplatte').replace(/\berh\.\s*BS\b/gi,'erhöhter Berührungsschutz').replace(/\bSchuko\b/gi,'Schutzkontakt (SCHUKO)').replace(/\bP-W\b/gi,'Polarweiß').replace(/\banth\b/gi,'Anthrazit').replace(/\balu(?=-|\s|$)/gi,'Aluminium');}
 function resolve(m){const code=gtin(m.catalog_gtin);if(code){const found=entries.filter(e=>e.gtin===code);if(found.length===1)return found[0];}return null;}
 const displayName=m=>expand(resolve(m)?.full_name||raw(m));
 const image=m=>root.WorktimeProductFeatures?.safeImageURL(m.catalog_image_url||m.image_url||resolve(m)?.image_url)||'';
 function setIndex(data){entries=Object.values(data?.entries||{}).filter(e=>e&&gtin(e.gtin)===e.gtin&&/^https:\/\/assets\.hager\.com\//.test(e.image_url)&&/^https:\/\/hager\.com\/de\/katalog\/produkt\//.test(e.source_url));revision++;root.dispatchEvent?.(new Event('worktime-product-index'));}
 root.WorktimeProductDisplay={expand,resolve,displayName,image,setIndex,get revision(){return revision;}};
 if(root.document){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);fetch('https://raw.githubusercontent.com/FedEx-420/Projekt-Arbeitszeiterfassung/main/catalog-image-index.json',{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>fetch('catalog-image-index.json',{credentials:'omit'}).then(r=>r.json())).then(setIndex).catch(()=>{}).finally(()=>clearTimeout(timer));}
})(globalThis);
