const assert=require('node:assert/strict'),zlib=require('node:zlib'),C=require('../../catalog-import-v909.js');
const header='V'.padEnd(123,' ')+'04EUR';
const file=(text,name='datanorm.001')=>new File([text],name);
const a=(id)=>`A;N;${id};;Artikel ${id};;1;0;Stk;9999;RG;WG;LG`;
const pp=(id,amount='1000',discount='2500',kind='1')=>[id,kind,amount,...(discount===null?Array(6).fill(''):['1',discount,'','','',''])];
const price=(...blocks)=>'P;A;'+blocks.flat().join(';')+';';
const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return (n^0xffffffff)>>>0;};
function zip(entries,method=8){const parts=[],central=[];let start=0;for(const [name,source]of entries){const nameBytes=Buffer.from(name),data=Buffer.from(source),compressed=method===8?zlib.deflateRawSync(data):data,local=Buffer.alloc(30),entry=Buffer.alloc(46),checksum=crc(data);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(method,10);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(nameBytes.length,28);entry.writeUInt32LE(start,42);parts.push(local,nameBytes,compressed);central.push(entry,nameBytes);start+=local.length+nameBytes.length+compressed.length;}const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(start,16);return Buffer.concat([...parts,directory,end]);}
(async()=>{
const stem=file([header,...Array.from({length:1004},(_,i)=>a(String(i)))].join('\r\n'));
const prices=new File([zip([['datpreis.001',[header,price(pp('1001'),pp('1002','2000','4500'),pp('1003','3000',null,'2')),price(pp('1002','900',null,'2'))].join('\r\n')]])],'prices.zip');
const r=await C.readCatalog(stem,{priceFile:prices,onlyPriced:true,maxRows:2,scanAll:true});
assert.deepEqual(r.rows.map(x=>x.article_number),['1001','1002']);assert.equal(r.totalMatches,3);assert.equal(r.hasMore,true);assert.equal(r.rows[0].source_list_price,'10.00');assert.equal(r.rows[0].source_net_price,'7.50');assert.equal(r.rows[1].source_net_price,'9.00');
const next=await C.readCatalog(stem,{priceFile:prices,onlyPriced:true,maxRows:2,offset:2,scanAll:true});assert.equal(next.rows[0].article_number,'1003');assert.equal(next.rows[0].source_net_price,'30.00');
const conflicts=file([header,price(pp('1001')),price(pp('1001','2000'))].join('\n'),'datpreis.001');assert.equal((await C.readCatalog(stem,{priceFile:conflicts,onlyPriced:true,scanAll:true})).rows.length,0);
const future=file([header,'C;;TERMIN-1;01122999;',price(pp('1001'))].join('\n'),'datpreis.001');await assert.rejects(C.readCatalog(stem,{priceFile:future}),/Gültigkeitstermin/);
const showAll=await C.readCatalog(stem,{priceFile:prices,onlyPriced:false,maxRows:1});assert.equal(showAll.rows[0].source_list_price,'');assert.equal(showAll.rows[0].source_net_price,'');
console.log('PASS separate ZIP prices, all three V4 blocks, discount math, explicit net precedence, filtering before preview limit, paging, conflicts, future validity, no fallback to stale stem prices');
})().catch(e=>{console.error(e);process.exitCode=1});
