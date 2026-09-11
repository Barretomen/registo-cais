  'use strict';

  const OLD_KEY='registo_cais_records_v1';
  const COURIER_KEY='registo_cais_records_v2';
  const VEHICLE_KEY='registo_cais_vehicle_records_v1';
  const PERSON_KEY='registo_cais_person_records_v1';
  const GUARD_KEY='registo_cais_guard_number_v1';
  const GUARD_NAME_KEY='registo_cais_guard_name_v1';
  const THEME_KEY='registo_cais_theme_v1';
  const MODULE_KEY='registo_cais_module_v1';
  const CLOUD_ENABLED=Boolean(window.CLOUD_CONFIG&&window.CLOUD_CONFIG.enabled);

  const $=id=>document.getElementById(id);
  const getLocal=k=>{try{return localStorage.getItem(k)||''}catch(_){return ''}};
  const setLocal=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
  const pad=n=>String(n).padStart(2,'0');
  const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
  const nowTime=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
  const localIsoDateTime=()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
  const nowStamp=()=>{const d=new Date();return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`};
  const formatShortDate=iso=>{if(!iso)return '—';const[y,m,d]=iso.split('-');return `${d}/${m}/${y}`};
  const formatDate=iso=>{if(!iso)return '—';const[y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date(y,m-1,d))};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm=s=>String(s||'').trim().toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const plateNorm=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'');
  const newId=()=>`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  function normalizeBase(r,legacy=false){
    const date=r.entryDate||r.date||todayISO(),time=r.entryTime||r.time||'00:00';
    return {id:r.id||newId(),entryDate:date,entryTime:time,entryAt:r.entryAt||`${date}T${time}:00`,exitDate:r.exitDate||'',exitTime:r.exitTime||'',exitAt:r.exitAt||'',status:legacy?'unknown':((r.status==='left'||r.exitTime||r.exitAt)?'left':(r.status==='unknown'?'unknown':'inside')),guardName:String(r.guardName||'').trim(),guardNumber:String(r.guardNumber||'').trim(),createdAt:Number(r.createdAt)||Date.now(),updatedAt:Number(r.updatedAt)||Number(r.createdAt)||Date.now()};
  }
  const normalizeCourier=(r,legacy=false)=>({...normalizeBase(r,legacy),name:String(r.name||'').trim(),destination:String(r.destination||'').trim(),platform:String(r.platform||'Outro').trim()});
  const normalizeVehicle=r=>({...normalizeBase(r,false),plate:plateNorm(r.plate),persons:String(r.persons||'').trim(),company:String(r.company||'').trim(),destination:String(r.destination||'').trim()});
  function normalizePerson(r){
    const authorization=['authorized','denied'].includes(r.authorization)?r.authorization:'pending';
    return {...normalizeBase(r,false),names:String(r.names||r.name||'').trim(),company:String(r.company||'').trim(),destination:String(r.destination||'').trim(),activity:String(r.activity||r.reason||'').trim(),authorization,authorizationDate:String(r.authorizationDate||'').trim(),authorizationTime:String(r.authorizationTime||'').trim(),authorizationAt:String(r.authorizationAt||'').trim()};
  }
  function loadCourierRecords(){try{const a=JSON.parse(localStorage.getItem(COURIER_KEY)||'null');if(Array.isArray(a))return a.map(r=>normalizeCourier(r));const old=JSON.parse(localStorage.getItem(OLD_KEY)||'[]');if(Array.isArray(old)&&old.length){const m=old.map(r=>normalizeCourier(r,true));localStorage.setItem(COURIER_KEY,JSON.stringify(m));return m}}catch(_){}return []}
  function loadVehicleRecords(){try{const a=JSON.parse(localStorage.getItem(VEHICLE_KEY)||'[]');return Array.isArray(a)?a.map(normalizeVehicle):[]}catch(_){return []}}
  function loadPersonRecords(){try{const a=JSON.parse(localStorage.getItem(PERSON_KEY)||'[]');return Array.isArray(a)?a.map(normalizePerson):[]}catch(_){return []}}

  const storedModule=getLocal(MODULE_KEY);
  const state={
    courierRecords:loadCourierRecords(),vehicleRecords:loadVehicleRecords(),personRecords:loadPersonRecords(),
    selectedPlatform:'',reportDate:todayISO(),editingId:null,vehicleEditingId:null,personEditingId:null,
    guardNumber:getLocal(GUARD_KEY),guardName:getLocal(GUARD_NAME_KEY),theme:getLocal(THEME_KEY)||'light',
    module:['viaturas','pessoas'].includes(storedModule)?storedModule:'estafetas',
    cloudEnabled:CLOUD_ENABLED,cloudReady:false,currentUserId:'',userRole:'',siteId:'',profileName:'',syncing:false
  };

  function saveRecords(){setLocal(COURIER_KEY,JSON.stringify(state.courierRecords));setLocal(VEHICLE_KEY,JSON.stringify(state.vehicleRecords));setLocal(PERSON_KEY,JSON.stringify(state.personRecords));if(state.cloudEnabled&&window.cloudApp)window.cloudApp.scheduleSync()}
  function currentRecords(){return state.module==='viaturas'?state.vehicleRecords:(state.module==='pessoas'?state.personRecords:state.courierRecords)}
  function recordsFor(date){return currentRecords().filter(r=>r.entryDate===date).sort((a,b)=>a.entryTime.localeCompare(b.entryTime))}
  function insideRecords(){return currentRecords().filter(r=>r.status==='inside').sort((a,b)=>b.createdAt-a.createdAt)}
  function parseLocal(date,time){if(!date||!time)return null;const[y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number);return new Date(y,m-1,d,hh,mm,0,0)}
  function durationLabel(r){if(r.status!=='left'||!r.exitDate||!r.exitTime)return 'Em permanência';const a=parseLocal(r.entryDate,r.entryTime),b=parseLocal(r.exitDate,r.exitTime);if(!a||!b)return '—';const mins=Math.round((b-a)/60000);if(mins<0)return 'Hora inválida';if(mins<60)return `${mins} min`;const h=Math.floor(mins/60),m=mins%60;return m?`${h}h ${m}min`:`${h}h`}
  const statusLabel=r=>r.status==='left'?'Saiu':(r.status==='unknown'?'Sem saída':'Dentro');
  const statusClass=r=>r.status==='inside'?'inside':(r.status==='left'?'left':'unknown');
  const authLabel=r=>r.authorization==='authorized'?'Autorizado':(r.authorization==='denied'?'Não autorizado':'Aguarda autorização');
  const authClass=r=>r.authorization==='authorized'?'authorized':(r.authorization==='denied'?'denied':'pending');

  function applyTheme(theme){state.theme=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=state.theme;setLocal(THEME_KEY,state.theme);$('themeToggle').textContent=state.theme==='dark'?'Modo claro':'Modo escuro';const meta=document.querySelector('meta[name=theme-color]');if(meta)meta.setAttribute('content',state.theme==='dark'?'#07171c':'#102a32')}
  function renderGuard(){const central=state.cloudEnabled&&['centralist','admin'].includes(state.userRole),identity=central?(state.profileName||'Central'):(state.guardName?`${state.guardName} · nº ${state.guardNumber||'—'}`:`Vigilante nº ${state.guardNumber||'—'}`);$('guardBadge').textContent=identity;$('reportGuardLabel').textContent=identity}
  function updateClock(){const d=new Date(),stamp=`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;$('liveTime').textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`;$('liveDateLong').textContent=new Intl.DateTimeFormat('pt-PT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d);$('buttonDateTime').textContent=stamp;$('vehicleButtonDateTime').textContent=stamp;$('personButtonDateTime').textContent=stamp}

  function moduleInfo(){
    if(state.module==='viaturas')return {title:'Registo de Viaturas',count:'viaturas hoje',movements:'Movimentos de viaturas',inside:'Viaturas dentro',insideHelp:'Toque em “Saiu” quando a viatura abandonar o cais.',search:'Pesquisar matrícula, pessoa, empresa...',empty:'Nenhuma viatura registada',emptyText:'A primeira viatura do dia vai aparecer aqui.',report:'RELATÓRIO DE VIATURAS'};
    if(state.module==='pessoas')return {title:'Registo de Pessoas',count:'pessoas hoje',movements:'Entradas de pessoas',inside:'Pessoas no Cais',insideHelp:'A autorização da Central não altera a hora de entrada. Toque em “Saiu” quando a pessoa abandonar o Cais.',search:'Pesquisar nome, empresa, destino...',empty:'Nenhuma pessoa registada',emptyText:'A primeira entrada de pessoa do dia vai aparecer aqui.',report:'REGISTO DE ENTRADA E SAÍDA DE PESSOAS'};
    return {title:'Registo de Estafetas',count:'entradas hoje',movements:'Movimentos de estafetas',inside:'Estafetas dentro',insideHelp:'Toque em “Saiu” quando o estafeta abandonar o cais.',search:'Pesquisar nome, loja...',empty:'Nenhuma entrada registada',emptyText:'O primeiro estafeta do dia vai aparecer aqui.',report:'RELATÓRIO DE ESTAFETAS'};
  }
  function switchModule(module){
    state.module=['viaturas','pessoas'].includes(module)?module:'estafetas';setLocal(MODULE_KEY,state.module);
    document.querySelectorAll('.module-btn').forEach(b=>b.classList.toggle('active',b.dataset.module===state.module));
    const monitorOnly=state.cloudEnabled&&state.userRole==='centralist';$('courierForm').classList.toggle('hidden',state.module!=='estafetas'||monitorOnly);$('vehicleForm').classList.toggle('hidden',state.module!=='viaturas'||monitorOnly);$('personForm').classList.toggle('hidden',state.module!=='pessoas'||monitorOnly);
    const registerTabButton=document.querySelector('.tab[data-tab="register"]');if(registerTabButton)registerTabButton.childNodes[0].textContent=monitorOnly?'Monitor ':'Registar ';
    const i=moduleInfo();$('moduleTitle').textContent=i.title;$('todayCountLabel').textContent=i.count;$('movementsTitle').textContent=i.movements;$('insideTitle').textContent=i.inside;$('insideHelp').textContent=i.insideHelp;$('searchInput').placeholder=i.search;$('emptyTitle').textContent=i.empty;$('emptyText').textContent=i.emptyText;$('reportKind').textContent=i.report;
    selectTab('register');renderAll();
  }

