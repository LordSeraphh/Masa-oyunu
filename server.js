// Mülk Ustası - sunucu. Çalıştır: node server.js
const http=require('http'),fs=require('fs'),os=require('os'),path=require('path');
const PORT=process.env.PORT||3000;
const NAMES=['Mamak','Keçiören','Ulus','Çankaya','Beşiktaş','Kadıköy','Üsküdar','Sarıyer','Bornova','Karşıyaka','Alsancak','Konak','Lara','Kaleiçi','Nişantaşı','Bebek','Etiler','Boğaz'];
const PRICES=[60,60,80,100,120,120,140,140,160,160,180,200,200,220,260,280,300,350];
const LAYOUT='SPPCPPTRPPCPPPRPCPPTPRPCPPPP';
let pi=0;
const TILES=[...LAYOUT].map(c=>c==='P'?{type:'P',name:NAMES[pi],price:PRICES[pi++]}:{type:c,name:{S:'BAŞLANGIÇ',C:'ŞANS',T:'VERGİ',R:'Dinlenme'}[c]});
const COLORS=['#e63946','#2a9d8f','#e9c46a','#9d4edd'];
let G,secrets=[];const clients=new Set();
function reset(keep){const old=keep?G.players:[];G={phase:'lobby',players:old.map(p=>({i:p.i,name:p.name,color:p.color})),settings:keep?G.settings:{startMoney:1500,salary:200,teams:false,chanceGood:50,taxPct:15,maxRounds:0},turn:0,round:1,step:'roll',owners:{},levels:{},log:[],history:[],dice:[0,0],pending:null,winner:'',tiles:TILES};}
reset();
const hc=t=>Math.round(TILES[t].price/2),val=t=>TILES[t].price+(G.levels[t]||0)*hc(t);
const mine=i=>Object.keys(G.owners).filter(k=>G.owners[k]===i);
const propsVal=i=>mine(i).reduce((s,t)=>s+val(t),0);
const nw=i=>G.players[i].money+propsVal(i);
const log=m=>{G.log.unshift(m);G.log.length=Math.min(G.log.length,40)};
const pick=a=>a[Math.random()*a.length|0];
const snap=()=>G.history.push({r:G.round,nw:G.players.map((p,i)=>nw(i))});
function bust(i){const p=G.players[i];p.alive=false;p.money=0;mine(i).forEach(t=>{delete G.owners[t];delete G.levels[t]});log(`💀 ${p.name} iflas etti!`)}
function charge(i,amt,to){const p=G.players[i];
  while(p.money<amt){const t=mine(i).sort((a,b)=>val(a)-val(b))[0];if(t===undefined)break;p.money+=Math.round(val(t)/2);delete G.owners[t];delete G.levels[t];log(`${p.name} borç için ${TILES[t].name} mülkünü yarı fiyata sattı`)}
  const paid=Math.min(p.money,amt);p.money-=paid;if(to!=null)G.players[to].money+=paid;if(paid<amt)bust(i);return paid}
const guard=(i,f)=>{const p=G.players[i];if(p.shield){p.shield=false;log(`🛡️ ${p.name}'in kalkanı mülklerini korudu!`)}else f()};
const others=i=>G.players.filter(p=>p.alive&&p.i!==i).map(p=>p.i);
const GOOD=[
 ['Piyangodan 150₺ kazandın!',i=>G.players[i].money+=150],
 ['Miras kaldı: +200₺',i=>G.players[i].money+=200],
 ['Koruma kalkanı! Sıradaki kötü olaydan mülklerin korunur.',i=>G.players[i].shield=true],
 ['Bedava yapı: rastgele mülküne +1 seviye (mülkün yoksa 100₺).',i=>{const t=mine(i).filter(t=>(G.levels[t]||0)<3);if(t.length){const k=pick(t);G.levels[k]=(G.levels[k]||0)+1}else G.players[i].money+=100}],
 ['Doğum günü! Her oyuncudan 30₺ aldın.',i=>others(i).forEach(j=>charge(j,30,i))],
 ['Başlangıca ışınlandın ve maaşı aldın!',i=>{G.players[i].pos=0;G.players[i].money+=G.settings.salary}]];
const BAD=[
 ['DEPREM! Tüm mülklerindeki yapılar 1 seviye yıkıldı (yapı yoksa mülk değerinin %5\'i onarım).',i=>guard(i,()=>{let n=0;mine(i).forEach(t=>{if(G.levels[t]>0){G.levels[t]--;n++}});if(!n)charge(i,Math.round(propsVal(i)*.05),null)})],
 ['YANGIN! Rastgele bir mülkünün tüm yapıları yandı.',i=>guard(i,()=>{const t=mine(i);if(t.length)G.levels[pick(t)]=0})],
 ['SEL! Her yapı için 40₺ onarım masrafı.',i=>guard(i,()=>charge(i,40*mine(i).reduce((s,t)=>s+(G.levels[t]||0),0),null))],
 ['Trafik cezası: -100₺',i=>charge(i,100,null)],
 ['Hırsızlık: -150₺',i=>charge(i,150,null)],
 ['Kötü yatırım: paranın %10\'unu kaybettin.',i=>charge(i,Math.round(G.players[i].money*.1),null)]];
function land(i){const p=G.players[i],t=TILES[p.pos],S=G.settings;
  if(t.type==='P'){const o=G.owners[p.pos];
    if(o===undefined){if(p.money>=t.price)G.pending=p.pos;else log(`${p.name}'in ${t.name} için parası yetmedi`)}
    else if(o!==i){if(S.teams&&o%2===i%2)log(`${t.name} takım arkadaşının, kira yok`);
      else{const r=Math.round(t.price*.1*(1+(G.levels[p.pos]||0)*1.5));charge(i,r,o);log(`${p.name} → ${G.players[o].name}'e ${r}₺ kira ödedi`)}}}
  else if(t.type==='T'){const a=Math.round(propsVal(i)*S.taxPct/100);charge(i,a,null);log(`💸 ${p.name} vergi ödedi: ${a}₺ (mülk değeri %${S.taxPct})`)}
  else if(t.type==='C'){const good=Math.random()*100<S.chanceGood,c=pick(good?GOOD:BAD);log(`${good?'🍀':'⚡'} ${p.name} ŞANS: ${c[0]}`);c[1](i)}}
function finish(){snap();G.phase='over';const S=G.settings;
  if(S.teams){const t=[0,0];G.players.forEach((p,i)=>t[i%2]+=nw(i));G.winner=t[0]===t[1]?'Berabere':t[0]>t[1]?'Takım A kazandı!':'Takım B kazandı!'}
  else{let b=0;G.players.forEach((p,i)=>{if(nw(i)>nw(b))b=i});G.winner=G.players[b].name+' kazandı!'}}
function endTurn(){const al=G.players.filter(p=>p.alive);
  if(al.length<2||(G.settings.teams&&al.every(p=>p.i%2===al[0].i%2)))return finish();
  let n=G.turn;do{n=(n+1)%G.players.length;if(n===0){G.round++;snap()}}while(!G.players[n].alive);
  if(G.settings.maxRounds&&G.round>G.settings.maxRounds)return finish();
  G.turn=n;G.step='roll';G.pending=null}
const clamp=(v,a,b,d)=>{v=Number(v);return isNaN(v)?d:Math.min(b,Math.max(a,Math.round(v)))};
function handle(url,a){const me=secrets.indexOf(a.id);
  if(url==='/join'){if(me>=0)return{me};
    if(G.phase!=='lobby')return{err:'Oyun başladı, katılamazsın.'};
    if(G.players.length>=4)return{err:'Oda dolu (en fazla 4).'};
    const id=Math.random().toString(36).slice(2),i=G.players.length;secrets.push(id);
    G.players.push({i,name:String(a.name||'Oyuncu').trim().slice(0,12)||'Oyuncu',color:COLORS[i]});return{id,me:i}}
  if(me<0)return{err:'Giriş yok'};
  const p=G.players[me],S=G.settings;
  if(a.type==='set'&&me===0&&G.phase==='lobby'){const s=a.s||{};
    S.startMoney=clamp(s.startMoney,100,100000,1500);S.salary=clamp(s.salary,0,5000,200);S.chanceGood=clamp(s.chanceGood,0,100,50);
    S.taxPct=clamp(s.taxPct,0,100,15);S.maxRounds=clamp(s.maxRounds,0,500,0);S.teams=!!s.teams;return{}}
  if(a.type==='start'&&me===0&&G.phase==='lobby'){
    if(G.players.length<2)return{err:'En az 2 oyuncu gerekli.'};
    if(S.teams&&G.players.length!==4)return{err:'Takım modu (2v2) için tam 4 oyuncu gerekli.'};
    G.players.forEach(q=>{q.money=S.startMoney;q.pos=0;q.alive=true;q.shield=false});
    G.phase='play';G.turn=0;G.round=1;G.step='roll';G.history=[];snap();log('Oyun başladı!');return{}}
  if(a.type==='again'&&me===0&&G.phase==='over'){reset(true);return{}}
  if(G.phase!=='play'||G.turn!==me||!p.alive)return{};
  if(a.type==='roll'&&G.step==='roll'){const d=[1+Math.random()*6|0,1+Math.random()*6|0],np=p.pos+d[0]+d[1];G.dice=d;
    if(np>=28){p.money+=S.salary;log(`${p.name} başlangıçtan geçti: +${S.salary}₺`)}
    p.pos=np%28;log(`${p.name} ${d[0]}+${d[1]} attı → ${TILES[p.pos].name}`);land(me);
    if(!p.alive)endTurn();else G.step=G.pending!=null?'buy':'act'}
  else if(a.type==='buy'&&G.step==='buy'){const t=G.pending;p.money-=TILES[t].price;G.owners[t]=me;G.pending=null;G.step='act';log(`${p.name} ${TILES[t].name} mülkünü aldı`)}
  else if(a.type==='skip'&&G.step==='buy'){G.pending=null;G.step='act'}
  else if(a.type==='build'&&G.step==='act'){const t=a.tile;
    if(G.owners[t]===me&&(G.levels[t]||0)<3&&p.money>=hc(t)){p.money-=hc(t);G.levels[t]=(G.levels[t]||0)+1;log(`${p.name} ${TILES[t].name} mülküne yapı ekledi`)}}
  else if(a.type==='end'&&G.step==='act')endTurn();
  return{}}
setInterval(()=>clients.forEach(r=>r.write(':\n\n')),20000);
function broadcast(){const m='data:'+JSON.stringify(G)+'\n\n';clients.forEach(r=>r.write(m))}
http.createServer((q,r)=>{
  if(q.method==='GET'&&q.url==='/'){r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return r.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(q.url.startsWith('/events')){r.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});clients.add(r);q.on('close',()=>clients.delete(r));return r.write('data:'+JSON.stringify(G)+'\n\n')}
  if(q.method==='POST'){let b='';q.on('data',d=>b+=d);q.on('end',()=>{let a={};try{a=JSON.parse(b)}catch{}
    let res;try{res=handle(q.url,a)}catch(e){console.error(e);res={err:'Sunucu hatası'}}
    r.writeHead(200,{'Content-Type':'application/json'});r.end(JSON.stringify(res||{}));broadcast()});return}
  r.writeHead(404);r.end()}).listen(PORT,'0.0.0.0',()=>{
  console.log(`\nMülk Ustası hazır!\nSen:        http://localhost:${PORT}`);
  Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).forEach(n=>console.log(`Arkadaşlar: http://${n.address}:${PORT}`))});
