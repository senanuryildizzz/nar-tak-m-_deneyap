const $ = id => document.getElementById(id);
const store = { get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}, set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)) };

/* ---------- Ortak ---------- */
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
function speak(text){
  if(!('speechSynthesis' in window))return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang='tr-TR';u.rate=.85;speechSynthesis.speak(u);
}
function tick(){const d=new Date();$('clock').textContent=d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}
setInterval(()=>{tick();renderNeeds()},30000);tick();

/* ---------- 1) Bağlam duyarlı tahmin ---------- */
const PLACES = {
  mutfak:{icon:'🍳',name:'Mutfak'}, salon:{icon:'🛋️',name:'Salon'}, yatak:{icon:'🛏️',name:'Yatak odası'},
  banyo:{icon:'🚿',name:'Banyo'}, sokak:{icon:'🚶',name:'Sokak'}, hastane:{icon:'🏥',name:'Hastane'}
};
const NEEDS = {
  acikim:{i:'🍽️',t:'Acıktım'}, su:{i:'💧',t:'Su istiyorum'}, ilac:{i:'💊',t:'İlaç saati'}, cay:{i:'☕',t:'Çay / kahve'},
  tv:{i:'📺',t:'TV açın'}, dinlen:{i:'😴',t:'Dinlenmek istiyorum'}, uyku:{i:'🌙',t:'Uykum geldi'}, agri:{i:'🤕',t:'Ağrım var'},
  tuvalet:{i:'🚻',t:'Tuvalete gitmek istiyorum'}, banyo:{i:'🛁',t:'Yıkanmak istiyorum'}, yardim:{i:'🆘',t:'Yardım lazım',u:1},
  kayboldum:{i:'🧭',t:'Yolumu kaybettim',u:1}, eve:{i:'🏠',t:'Eve gitmek istiyorum'}, doktor:{i:'👩‍⚕️',t:'Doktoru çağırın',u:1},
  aile:{i:'📞',t:'Ailemi arayın',u:1}, oturmak:{i:'🪑',t:'Oturmak istiyorum'}, soguk:{i:'🥶',t:'Üşüyorum'}, sicak:{i:'🥵',t:'Sıcak bastı'}
};
const BASE = { // yere göre temel kartlar
  mutfak:['acikim','su','cay','ilac','agri'], salon:['tv','cay','su','dinlen','soguk','sicak'],
  yatak:['uyku','ilac','su','agri','tuvalet'], banyo:['banyo','tuvalet','yardim','soguk'],
  sokak:['yardim','kayboldum','eve','aile','oturmak','su'], hastane:['yardim','doktor','agri','tuvalet','aile','su']
};
const MEDS = ['08:00','13:00','20:00']; // ilaç saatleri

let place = store.get('place', null);
const hr = () => new Date().getHours();
function guessPlaceByTime(){const h=hr();return h>=22||h<7?'yatak':(h>=11&&h<14)||(h>=18&&h<20)||(h>=7&&h<9)?'mutfak':'salon'}

function timeBoost(){ // saate göre öne çıkanlar + açıklama
  const d=new Date(),h=d.getHours(),m=d.getMinutes(),hot=[],why=[];
  if((h>=12&&h<15)||(h>=18&&h<20)||(h>=7&&h<9)){hot.push('acikim','su');why.push('yemek saati')}
  if(h>=22||h<6){hot.push('uyku');why.push('gece saati')}
  const now=h*60+m;
  if(MEDS.some(t=>{const[a,b]=t.split(':').map(Number);return Math.abs(a*60+b-now)<=45})){hot.unshift('ilac');why.push('ilaç saati yaklaştı')}
  return {hot,why};
}

function renderPlaces(){
  $('placeChips').innerHTML=Object.entries(PLACES).map(([k,p])=>`<button class="chip ${place===k?'active':''}" data-p="${k}"><i>${p.icon}</i>${p.name}</button>`).join('');
  $('placeChips').querySelectorAll('button').forEach(b=>b.onclick=()=>{place=b.dataset.p;store.set('place',place);renderPlaces();renderNeeds()});
}
function renderNeeds(){
  const p=place||guessPlaceByTime(), {hot,why}=timeBoost();
  const keys=[...new Set([...hot.filter(k=>BASE[p].includes(k)||k==='ilac'),...BASE[p]])];
  const hh=new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  $('ctxText').textContent=`🕒 ${hh}${why.length?' • '+why[0]:''}`;
  $('needCards').innerHTML=keys.map((k,i)=>{const n=NEEDS[k],isHot=hot.includes(k);
    return `<button class="need ${isHot?'hot':''} ${n.u?'urgent':''}" style="animation-delay:${i*50}ms" data-t="${n.t}"><span>${n.i}</span>${n.t}</button>`}).join('');
  $('needCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{speak(b.dataset.t);toast('🔊 '+b.dataset.t)});
}
$('gpsPlaceBtn').onclick=()=>{
  if(!navigator.geolocation)return toast('Bu cihaz GPS desteklemiyor');
  toast('Konum alınıyor…');
  navigator.geolocation.getCurrentPosition(pos=>{
    // Evde mi dışarıda mı? Ev konumu kayıtlıysa mesafeye bakılır, değilse ilk konum "ev" olarak kaydedilir.
    let home=store.get('home',null);
    if(!home){home={lat:pos.coords.latitude,lng:pos.coords.longitude};store.set('home',home);toast('🏠 Bu konum "ev" olarak kaydedildi');place=guessPlaceByTime()}
    else{
      const dist=distM(home,{lat:pos.coords.latitude,lng:pos.coords.longitude});
      place=dist>150?'sokak':guessPlaceByTime();
      toast(dist>150?`Evden ${Math.round(dist)} m uzaktasın → Sokak`:'Evdesin');
    }
    store.set('place',place);renderPlaces();renderNeeds();
  },()=>toast('Konum izni verilmedi'),{enableHighAccuracy:true,timeout:10000});
};
function distM(a,b){const R=6371e3,r=x=>x*Math.PI/180,dl=r(b.lat-a.lat),dn=r(b.lng-a.lng);
  const h=Math.sin(dl/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}

/* ---------- 2) Hafıza albümü ---------- */
const CATS={all:'Hepsi',people:'👨‍👩‍👧 Yakınlar',rooms:'🏠 Ev',things:'🧸 Eşyalar',pets:'🐶 Hayvanlar'};
const DEFAULT=[
  {id:1,name:'Hatice Zeynep',rel:'en yakın arkadaşın',cat:'people',emoji:'👩',photo:'img/hatice.jpg'},
  {id:2,name:'Figen Caymaz',rel:'Deneyap\'tan sınıf arkadaşın',cat:'people',emoji:'👩',photo:'img/figen.jpg'},
  {id:3,name:'Elif Leya',rel:'okuldan arkadaşın',cat:'people',emoji:'👩',photo:'img/elif.jpg'},
  {id:4,name:'Mutfak',rel:'yemek yapılan yer',cat:'rooms',emoji:'🍳'},
  {id:5,name:'Yatak odası',rel:'uyuduğun yer',cat:'rooms',emoji:'🛏️'},{id:6,name:'Bardak',rel:'su içtiğin',cat:'things',emoji:'🥛'},
  {id:7,name:'Gözlük',rel:'okurken taktığın',cat:'things',emoji:'👓'},{id:8,name:'Pamuk',rel:'kedin',cat:'pets',emoji:'🐱',photo:'img/pamuk.jpg'}
];
let items=store.get('items2',DEFAULT),filter='all';
const save=()=>store.set('items2',items);
function visual(it,cls=''){return it.photo?`<img src="${it.photo}" alt="${it.name}">`:`<div class="ph">${it.emoji||'⭐'}</div>`}

function renderFilter(){
  $('albumFilter').innerHTML=Object.entries(CATS).map(([k,v])=>`<button class="chip ${filter===k?'active':''}" data-c="${k}">${v}</button>`).join('');
  $('albumFilter').querySelectorAll('button').forEach(b=>b.onclick=()=>{filter=b.dataset.c;renderFilter();renderAlbum()});
}
function renderAlbum(){
  const list=items.filter(i=>filter==='all'||i.cat===filter);
  $('albumGrid').innerHTML=list.map((it,n)=>`<div class="item" style="animation-delay:${n*40}ms" data-id="${it.id}">${visual(it)}<b>${it.name}</b><small>${it.rel}</small><button class="del" title="Sil">✕</button></div>`).join('')||'<p class="muted">Henüz kayıt yok.</p>';
  $('albumGrid').querySelectorAll('.item').forEach(el=>{
    const it=items.find(i=>i.id==el.dataset.id);
    el.onclick=()=>{speak(`${it.name}, ${it.rel}`);toast(`🔊 ${it.name} – ${it.rel}`)};
    el.querySelector('.del').onclick=e=>{e.stopPropagation();if(confirm(it.name+' silinsin mi?')){items=items.filter(x=>x.id!=it.id);save();renderAlbum()}};
  });
}
const tr=s=>s.toLocaleLowerCase('tr-TR');
$('finderInput').oninput=e=>{
  const q=tr(e.target.value.trim());
  if(!q){$('suggest').innerHTML='';return}
  const hits=items.filter(i=>tr(i.name).startsWith(q)||tr(i.name).includes(q)).slice(0,4);
  $('suggest').innerHTML=hits.map(i=>{
    const phrase=i.cat==='people'?`${i.rel.charAt(0).toUpperCase()+i.rel.slice(1)} ${i.name} mi?`:i.cat==='pets'?`${i.rel.charAt(0).toUpperCase()+i.rel.slice(1)} ${i.name} mi?`:`${i.name} mi demek istedin?`;
    return `<button class="sg" data-s="${phrase}" >${i.photo?`<img src="${i.photo}">`:`<span>${i.emoji||'⭐'}</span>`}${phrase}</button>`}).join('')||`<p class="muted">Eşleşme yok. Albüme ekleyebilirsin.</p>`;
  $('suggest').querySelectorAll('.sg').forEach(b=>b.onclick=()=>speak(b.dataset.s));
};
let photoData=null;
$('photoInput').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const img=new Image(),r=new FileReader();
  r.onload=()=>{img.onload=()=>{ // küçült (localStorage için)
    const s=400,c=document.createElement('canvas'),m=Math.min(img.width,img.height);
    c.width=c.height=s;c.getContext('2d').drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,s,s);
    photoData=c.toDataURL('image/jpeg',.75);$('photoPreview').innerHTML=`<img src="${photoData}">`};img.src=r.result};
  r.readAsDataURL(f);
};
$('addForm').onsubmit=e=>{
  e.preventDefault();
  const emo={people:'🙂',rooms:'🏠',things:'🧸',pets:'🐾'}[$('addCat').value];
  items.push({id:Date.now(),name:$('addName').value.trim(),rel:$('addRel').value.trim(),cat:$('addCat').value,photo:photoData,emoji:emo});
  try{save()}catch{toast('Hafıza dolu, fotoğraf kaydedilemedi');return}
  e.target.reset();photoData=null;$('photoPreview').textContent='📷 Fotoğraf seç';renderAlbum();toast('✅ Eklendi');
};

/* ---------- 3) Acil durum ---------- */
function intlPhone(p){let n=p.replace(/\D/g,'');if(n.startsWith('0'))n='90'+n.slice(1);else if(!n.startsWith('90')&&n.length===10)n='90'+n;return n}
function getPos(){return new Promise(res=>{
  if(!navigator.geolocation)return res(null);
  navigator.geolocation.getCurrentPosition(p=>res(p.coords),()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:15000});
})}
function buildMsg(c){
  const link=c?`https://www.google.com/maps?q=${c.latitude},${c.longitude}`:null;
  return {link,text:`🚨 ACİL DURUM! Ben afazi hastasıyım, şu an konuşmakta zorlanıyorum, yardıma ihtiyacım var.\n`+(link?`📍 Konumum: ${link}`:'📍 Konum alınamadı, lütfen beni arayın.')+`\n🕒 ${new Date().toLocaleString('tr-TR')}`};
}
function showCard(link){$('cardLoc').textContent=link?'📍 '+link:'';$('overlay').hidden=false;if(navigator.vibrate)navigator.vibrate([300,100,300])}
async function sendSOS(mode){
  const st=$('sosStatus');st.textContent='📡 Konum alınıyor…';
  const phone=intlPhone($('phoneInput').value);store.set('phone',$('phoneInput').value);
  const c=await getPos(),{link,text}=buildMsg(c);
  st.textContent=c?'✅ Konum alındı, mesaj açılıyor…':'⚠️ Konum alınamadı, mesaj yine de hazırlandı';
  showCard(link);
  const url=mode==='sms'?`sms:+${phone}?body=${encodeURIComponent(text)}`:`https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  setTimeout(()=>{window.open(url,mode==='sms'?'_self':'_blank')||(location.href=url)},700);
}
$('sosBtn').onclick=()=>sendSOS('wa');
$('smsBtn').onclick=()=>sendSOS('sms');
$('cardBtn').onclick=()=>showCard(null);
$('closeCard').onclick=()=>$('overlay').hidden=true;
if(store.get('phone'))$('phoneInput').value=store.get('phone');

renderPlaces();renderNeeds();renderFilter();renderAlbum();
