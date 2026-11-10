// Mülk Ustası v2 - sunucu. Çalıştır: node server.js
const http=require('http'),fs=require('fs'),os=require('os'),path=require('path');
const PORT=process.env.PORT||3000;
const NAMES=['Mamak','Keçiören','Ulus','Çankaya','Beşiktaş','Kadıköy','Üsküdar','Sarıyer','Bornova','Karşıyaka','Alsancak','Konak','Lara','Kaleiçi','Nişantaşı','Bebek','Etiler','Boğaz'];
const PRICES=[60,60,80,100,120,120,140,140,160,160,180,200,200,220,260,280,300,350].map(x=>x*1000);
const LAYOUT='SPPCPPTJPPCPPPAPCPPTPKPCPPPP'; // S başlangıç, J hapis, A havaalanı, K şampiyonlar ligi
let pi=0;
const TILES=[...LAYOUT].map(c=>c==='P'?{type:'P',name:NAMES[pi],price:PRICES[pi++]}:{type:c,name:{S:'BAŞLANGIÇ',C:'ŞANS',T:'VERGİ',J:'HAPİSHANE',A:'HAVA ALANI',K:'ŞAMPİYONLAR LİGİ'}[c]});
const MULT=[.25,.5,.8,1.2,2],COST=[0,.3,.5,.7,1]; // seviye: 0 boş,1 bayrak,2,3,4 villa
const COLORS=['#e63946','#2a9d8f','#e9c46a','#9d4edd'];
const rooms={};let G;
function newRoom(code){return{code,phase:'lobby',players:[],settings:{startMoney:1500000,salary:200000,teams:false,chanceBad:30,taxPct:15,jailFee:100000,timeMin:0,maxRounds:0},turn:0,round:1,step:'roll',owners:{},levels:{},spent:{},lock:{},shield:{},blackout:{},champ:null,choice:null,card:null,log:[],history:[],dice:[0,0],pending:null,winner:'',endAt:0,tiles:TILES,sec:[],cl:new Set(),ts:Date.now()}}
const val=t=>TILES[t].price+(G.spent[t]||0);
const mine=i=>Object.keys(G.owners).filter(k=>G.owners[k]===i).map(Number);
const propsVal=i=>mine(i).reduce((s,t)=>s+val(t),0);
const nw=i=>G.players[i].money+propsVal(i);
const rentOf=t=>Math.round(TILES[t].price*MULT[G.levels[t]||0]*(G.champ&&G.champ.tile===t?G.champ.mult:1));
const log=m=>{G.log.unshift(m);G.log.length=Math.min(G.log.length,300)};
const pick=a=>a[Math.random()*a.length|0];
const snap=()=>G.history.push({r:G.round,nw:G.players.map((p,i)=>nw(i))});
const mate=(a,b)=>G.settings.teams&&a%2===b%2;
function wipe(t){['owners','levels','spent','lock','shield','blackout'].forEach(k=>delete G[k][t]);if(G.champ&&G.champ.tile===t)G.champ=null}
function bust(i){const p=G.players[i];p.alive=false;p.money=0;mine(i).forEach(wipe);log(`💀 ${p.name} iflas etti!`)}
function settle(i,amt,to){const p=G.players[i],paid=Math.min(p.money,amt);p.money-=paid;if(to!=null)G.players[to].money+=paid;if(paid<amt)bust(i)}
function charge(i,amt,to){const p=G.players[i];if(amt<=0)return;
  if(p.money<amt&&i===G.turn&&mine(i).length){G.choice={pid:i,kind:'debt',amt,to};return}
  while(p.money<amt){const t=mine(i).sort((a,b)=>val(a)-val(b))[0];if(t===undefined)break;p.money+=Math.round(val(t)/2);log(`${p.name} borç için ${TILES[t].name} mülkünü yarı fiyata sattı`);wipe(t)}
  settle(i,amt,to)}
function ask(i,kind,tiles,text){if(!tiles.length){log('Seçilecek uygun mülk yok, etkisiz.');return false}G.choice={pid:i,kind,tiles,text};return true}
const rivals=(i,f)=>Object.keys(G.owners).map(Number).filter(t=>G.owners[t]!==i&&!mate(G.owners[t],i)&&f(t));
const others=i=>G.players.filter(p=>p.alive&&p.i!==i).map(p=>p.i);
function fly(i){const dest=[];TILES.forEach((t,k)=>{if(k===14)return;if(t.type==='T'||t.type==='S')dest.push(k);else if(t.type==='P'){const o=G.owners[k];if(o===undefined||o===i||mate(o,i))dest.push(k)}});ask(i,'fly',dest,'Gitmek istediğin kareyi seç')}
const GOOD=[
 ['DEPREM','Rakiplerinden birinin mülkünü (villa hariç) yok et.',i=>ask(i,'quake',rivals(i,t=>(G.levels[t]||0)<4),'Yıkılacak rakip mülkünü seç')],
 ['ELEKTRİK KESİNTİSİ','Bir rakip mülkünü 3 tur karartırsın, kira alınamaz.',i=>ask(i,'elec',rivals(i,()=>true),'Karartılacak rakip mülkünü seç')],
 ['DOĞUM GÜNÜ','Her rakipten mülk değerinin %5\'ini alırsın.',i=>others(i).forEach(j=>charge(j,Math.round(propsVal(j)*.05),i))],
 ['KORUMA KALKANI','Seçtiğin mülk 1 kez saldırıdan korunur.',i=>ask(i,'shield',mine(i).filter(t=>!G.shield[t]),'Korunacak mülkünü seç')],
 ['İKRAMİYE','Tüm oyuncuların toplam mülk değerinin %20\'sini kazanırsın.',i=>{G.players[i].money+=Math.round(G.players.reduce((s,p,k)=>s+propsVal(k),0)*.2)}],
 ['YATIRIMCI','Bir mülkünü %120 değerle satarsın (mülk yoksa en yüksek kira kadar para).',i=>{if(!ask(i,'invest',mine(i),'%120 değerle satılacak mülkünü seç')){G.players[i].money+=Math.max(0,...Object.keys(G.owners).map(t=>rentOf(Number(t))))}}],
 ['HAVA ALANI','Doğrudan hava alanına gidersin.',i=>{G.players[i].pos=14;fly(i)}],
 ['BAŞLANGICA DÖN','Başlangıca dönersin ve maaşını alırsın.',i=>{const p=G.players[i];p.pos=0;p.laps++;p.money+=G.settings.salary}]];
const BAD=[
 ['SEL','Seçtiğin kendi mülkün 1 seviye düşer (sadece bayrak varsa yıkılır).',i=>ask(i,'flood',mine(i).filter(t=>(G.levels[t]||0)<4),'Selden zarar görecek mülkünü seç')],
 ['VERGİ ALANINA GİT','Doğrudan vergi karesine gidip vergi ödersin.',i=>{G.players[i].pos=6;land(i)}],
 ['HAPSE GİT','Doğrudan hapishaneye gidersin.',i=>{const p=G.players[i];p.pos=7;p.jail=true}],
 ['PANİK!','Tüm mülklerini %170 fiyatla satarsın.',i=>{const p=G.players[i];mine(i).forEach(t=>{p.money+=Math.round(val(t)*1.7);wipe(t)})}],
 ['ŞANSIMA','%50 ihtimalle paran 2 katına çıkar, %50 ihtimalle tamamı gider.',i=>{const p=G.players[i];if(Math.random()<.5)p.money*=2;else p.money=0}]];
function land(i){const p=G.players[i],t=TILES[p.pos],S=G.settings,k=p.pos;
  if(t.type==='P'){const o=G.owners[k];
    if(o===undefined){if(p.money>=t.price)G.pending={tile:k,price:t.price,seller:null};else log(`${p.name}'in ${t.name} için parası yetmedi`)}
    else if(o!==i){
      if(mate(o,i))log(`${t.name} takım arkadaşının, kira yok`);
      else if(G.blackout[k]>G.round)log(`🔌 ${t.name} elektriksiz, kira yok`);
      else{const r=rentOf(k);log(`${p.name} → ${G.players[o].name}'e ${r} ₺ kira`);G.card={who:i,name:'KİRA',text:`${t.name}: ${G.players[o].name}'e ${r.toLocaleString('tr')} ₺ kira`,bad:true,id:Math.random()};charge(i,r,o)}
      if(!G.choice&&p.alive&&(G.levels[k]||0)<4&&!mate(o,i)&&p.money>=val(k))G.pending={tile:k,price:val(k),seller:o}}}
  else if(t.type==='T'){const a=Math.round(propsVal(i)*S.taxPct/100);G.card={who:i,name:'VERGİ',text:`Mülk değerinin %${S.taxPct}'i: ${a.toLocaleString('tr')} ₺ vergi ödedin`,bad:true,id:Math.random()};log(`💸 ${p.name} vergi: ${a} ₺`);charge(i,a,null)}
  else if(t.type==='C'){const bad=Math.random()*100<S.chanceBad,c=pick(bad?BAD:GOOD);G.card={who:i,name:c[0],text:c[1],bad,id:Math.random()};log(`${bad?'⚡':'🍀'} ${p.name} ŞANS: ${c[0]} - ${c[1]}`);c[2](i)}
  else if(t.type==='J'){p.jail=true;log(`🚔 ${p.name} hapse düştü`)}
  else if(t.type==='A')fly(i);
  else if(t.type==='K')ask(i,'champ',mine(i),'Çarpan uygulanacak mülkünü seç')}
function proceed(){if(G.choice)return;if(!G.players[G.turn].alive)return endTurn();G.step=G.pending?'buy':'act'}
function move(i,n){const p=G.players[i],np=p.pos+n;if(np>=28){p.money+=G.settings.salary;p.laps++;log(`${p.name} başlangıçtan geçti: +${G.settings.salary} ₺`)}
  p.pos=np%28;log(`${p.name} ${TILES[p.pos].name} karesine geldi`);land(i);proceed()}
function finish(){snap();G.phase='over';G.choice=null;const S=G.settings;
  if(S.teams){const t=[0,0];G.players.forEach((p,i)=>t[i%2]+=nw(i));G.winner=t[0]===t[1]?'Berabere':t[0]>t[1]?'Takım A kazandı!':'Takım B kazandı!'}
  else{let b=0;G.players.forEach((p,i)=>{if(nw(i)>nw(b))b=i});G.winner=G.players[b].name+' kazandı!'}}
function endTurn(){const al=G.players.filter(p=>p.alive);G.card=null;G.pending=null;
  if(al.length<2||(G.settings.teams&&al.every(p=>p.i%2===al[0].i%2)))return finish();
  if(G.endAt&&Date.now()>G.endAt)return finish();
  let n=G.turn;do{n=(n+1)%G.players.length;if(n===0){G.round++;snap()}}while(!G.players[n].alive);
  if(G.settings.maxRounds&&G.round>G.settings.maxRounds)return finish();
  G.turn=n;G.step='roll'}
function resolve(me,t){const c=G.choice,p=G.players[me];if(!c||c.pid!==me)return;
  if(c.kind==='debt'){if(G.owners[t]!==me)return;p.money+=Math.round(val(t)/2);log(`${p.name} ${TILES[t].name} mülkünü yarı fiyata sattı`);wipe(t);
    if(p.money>=c.amt||!mine(me).length){G.choice=null;settle(me,c.amt,c.to)}return proceed()}
  if(!c.tiles.includes(t))return;G.choice=null;
  const protectedBy=()=>{if(G.shield[t]){delete G.shield[t];log(`🛡️ ${TILES[t].name} kalkanı saldırıyı engelledi`);return true}};
  switch(c.kind){
   case'fly':if(t<p.pos){p.money+=G.settings.salary;p.laps++}p.pos=t;log(`✈️ ${p.name} ${TILES[t].name} karesine uçtu`);land(me);break;
   case'quake':if(!protectedBy()){log(`🌋 ${TILES[t].name} yıkıldı!`);wipe(t)}break;
   case'elec':if(!protectedBy()){G.blackout[t]=G.round+3;log(`🔌 ${TILES[t].name} 3 tur karardı`)}break;
   case'shield':G.shield[t]=true;log(`🛡️ ${TILES[t].name} korumaya alındı`);break;
   case'flood':{const l=G.levels[t]||0;if(l<=1){log(`🌊 ${TILES[t].name} sel ile yıkıldı`);wipe(t)}else{G.spent[t]-=Math.round(TILES[t].price*COST[l]);G.levels[t]=l-1;log(`🌊 ${TILES[t].name} 1 seviye düştü`)}break}
   case'invest':p.money+=Math.round(val(t)*1.2);log(`${p.name} ${TILES[t].name} mülkünü %120'ye sattı`);wipe(t);break;
   case'champ':{const m=G.champ?+(G.champ.mult+.1).toFixed(1):1.5;G.champ={tile:t,mult:m};log(`🏆 ${TILES[t].name} kira çarpanı x${m}`)}break}
  proceed()}
const clamp=(v,a,b,d)=>{v=Number(v);return isNaN(v)?d:Math.min(b,Math.max(a,Math.round(v)))};
function handle(url,a){
  if(url==='/rooms')return{list:Object.values(rooms).filter(r=>r.phase==='lobby'&&r.players.length<4).map(r=>({code:r.code,host:r.players[0]&&r.players[0].name,n:r.players.length}))};
  if(url==='/create'){let c;do c=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms[c]);rooms[c]=newRoom(c);a.room=c;url='/join'}
  G=rooms[a.room];if(!G)return{err:'Oda bulunamadı.'};G.ts=Date.now();
  const me=G.sec.indexOf(a.id);
  if(url==='/join'){if(me>=0)return{me,room:G.code,id:a.id};
    if(G.phase!=='lobby')return{err:'Oyun başladı, katılamazsın.'};
    if(G.players.length>=4)return{err:'Oda dolu (en fazla 4).'};
    const id=Math.random().toString(36).slice(2),i=G.players.length;G.sec.push(id);
    G.players.push({i,name:String(a.name||'Oyuncu').trim().slice(0,12)||'Oyuncu',color:COLORS[i]});return{id,me:i,room:G.code}}
  if(me<0)return{err:'Giriş yok'};
  const p=G.players[me],S=G.settings;
  if(a.type==='set'&&me===0&&G.phase==='lobby'){const s=a.s||{};
    S.startMoney=clamp(s.startMoney,10000,1e9,1500000);S.salary=clamp(s.salary,0,1e7,200000);S.chanceBad=clamp(s.chanceBad,0,100,30);S.taxPct=clamp(s.taxPct,0,100,15);
    S.jailFee=clamp(s.jailFee,0,1e7,100000);S.timeMin=clamp(s.timeMin,0,300,0);S.maxRounds=clamp(s.maxRounds,0,500,0);S.teams=!!s.teams;return{}}
  if(a.type==='start'&&me===0&&G.phase==='lobby'){
    if(G.players.length<2)return{err:'En az 2 oyuncu gerekli.'};
    if(S.teams&&G.players.length!==4)return{err:'Takım modu (2v2) için tam 4 oyuncu gerekli.'};
    G.players.forEach(q=>{q.money=S.startMoney;q.pos=0;q.alive=true;q.laps=0;q.jail=false});
    G.phase='play';G.turn=0;G.round=1;G.step='roll';G.history=[];G.endAt=S.timeMin?Date.now()+S.timeMin*60000:0;snap();log('Oyun başladı!');return{}}
  if(a.type==='again'&&me===0&&G.phase==='over'){const n=newRoom(G.code);n.players=G.players.map(q=>({i:q.i,name:q.name,color:q.color}));n.settings=G.settings;n.sec=G.sec;n.cl=G.cl;rooms[G.code]=n;G=n;return{}}
  if(G.phase!=='play')return{};
  if(a.type==='pick')return resolve(me,Number(a.tile))||{};
  if(G.turn!==me||!p.alive||G.choice)return{};
  if(a.type==='roll'&&G.step==='roll'){const d=[1+Math.random()*6|0,1+Math.random()*6|0];G.dice=d;G.card=null;
    if(p.jail){if(d[0]===d[1]){p.jail=false;log(`${p.name} çift attı, hapisten çıktı`);move(me,d[0]+d[1])}else{log(`${p.name} çift atamadı (${d[0]}+${d[1]})`);G.step='act'}}
    else{log(`${p.name} ${d[0]}+${d[1]} attı`);move(me,d[0]+d[1])}}
  else if(a.type==='payjail'&&G.step==='roll'&&p.jail){if(p.money<S.jailFee)return{err:'Paran yetmiyor.'};p.money-=S.jailFee;p.jail=false;log(`${p.name} ${S.jailFee} ₺ ödeyip hapisten çıktı`)}
  else if(a.type==='buy'&&G.step==='buy'){const b=G.pending;p.money-=b.price;if(b.seller!==null){G.players[b.seller].money+=b.price;delete G.shield[b.tile];delete G.blackout[b.tile]}G.owners[b.tile]=me;G.pending=null;G.step='act';log(`${p.name} ${TILES[b.tile].name} mülkünü ${b.price} ₺'ye aldı`)}
  else if(a.type==='skip'&&G.step==='buy'){G.pending=null;G.step='act'}
  else if(a.type==='build'&&G.step==='act'){const t=p.pos;if(G.owners[t]!==me)return{err:'Sadece üzerinde durduğun kendi mülkünü geliştirebilirsin.'};
    const l=G.levels[t]||0;if(l>=4)return{};const nx=l+1,c=Math.round(TILES[t].price*COST[nx]);
    if(nx===4&&p.laps<=(G.lock[t]||0))return{err:'Villa için başlangıçtan bir kez daha geçmelisin.'};
    if(p.money<c)return{err:'Paran yetmiyor.'};p.money-=c;G.levels[t]=nx;G.spent[t]=(G.spent[t]||0)+c;if(nx===3)G.lock[t]=p.laps;log(`${p.name} ${TILES[t].name} mülkünü geliştirdi (seviye ${nx})`)}
  else if(a.type==='end'&&G.step==='act')endTurn();
  return{}}
const bc=g=>{if(!g)return;const m='data:'+JSON.stringify(g,(k,v)=>k==='sec'||k==='cl'?undefined:v)+'\n\n';g.cl.forEach(r=>r.write(m))};
setInterval(()=>{const now=Date.now();Object.values(rooms).forEach(g=>{g.cl.forEach(r=>r.write(':\n\n'));
  if(g.phase==='play'&&g.endAt&&now>g.endAt&&!g.choice){G=g;finish();bc(g)}
  if(now-g.ts>12*3600e3)delete rooms[g.code]})},15000);
http.createServer((q,r)=>{
  if(q.method==='GET'&&q.url==='/'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(q.url.startsWith('/events')){const g=rooms[new URL(q.url,'http://x').searchParams.get('room')];if(!g){r.writeHead(404);return r.end()}
    r.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});g.cl.add(r);q.on('close',()=>g.cl.delete(r));G=g;return bc(g)}
  if(q.method==='POST'){let b='';q.on('data',d=>b+=d);q.on('end',()=>{let a={};try{a=JSON.parse(b)}catch{}
    let res;try{res=handle(q.url,a)}catch(e){console.error(e);res={err:'Sunucu hatası'}}
    r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify(res||{}));if(a.room||res.room)bc(rooms[res.room||a.room])});return}
  r.writeHead(404);r.end()}).listen(PORT,'0.0.0.0',()=>{
  console.log(`\nMülk Ustası v2 hazır!\nSen:        http://localhost:${PORT}`);
  Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).forEach(n=>console.log(`Arkadaşlar: http://${n.address}:${PORT}`))});
