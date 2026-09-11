(function(){
  'use strict';

  if(!window.CLOUD_CONFIG?.enabled)return;

  const cfg=window.CLOUD_CONFIG;
  const client=window.supabase?.createClient(cfg.url,cfg.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  let channel=null,syncTimer=null,reloadTimer=null,idleTimer=null,applyingRemote=false;
  const recordKeys=[OLD_KEY,COURIER_KEY,VEHICLE_KEY,PERSON_KEY];

  function setSyncStatus(label,mode='online'){
    const badge=$('syncBadge');
    if(!badge)return;
    badge.className=`badge local sync-${mode}`;
    badge.innerHTML=`<i aria-hidden="true"></i> ${esc(label)}`;
  }

  function showAuth(message=''){
    $('authOverlay').classList.remove('hidden');
    $('logoutBtn').classList.add('hidden');
    $('authMessage').textContent=message;
    document.body.dataset.cloudRole='signed-out';
    setSyncStatus('Sessão necessária','offline');
  }

  function hideAuth(){
    $('authOverlay').classList.add('hidden');
    $('logoutBtn').classList.remove('hidden');
  }

  function clearRecordCache(){
    recordKeys.forEach(key=>{try{localStorage.removeItem(key)}catch(_){}});
  }

  function dateTimeIso(date,time){
    if(!date||!time)return null;
    const parsed=parseLocal(date,time);
    return parsed&&!Number.isNaN(parsed.getTime())?parsed.toISOString():null;
  }

  function toRow(kind,r){
    return {
      id:String(r.id),site_id:state.siteId||cfg.siteId,kind,
      person_name:kind==='estafetas'?r.name:(kind==='pessoas'?r.names:null),
      vehicle_plate:kind==='viaturas'?r.plate:null,
      vehicle_persons:kind==='viaturas'?r.persons:null,
      company:kind==='viaturas'||kind==='pessoas'?r.company:null,
      destination:r.destination||'',activity:kind==='pessoas'?r.activity:null,
      platform:kind==='estafetas'?r.platform:null,
      entry_date:r.entryDate,entry_time:r.entryTime,entry_at:dateTimeIso(r.entryDate,r.entryTime),
      exit_date:r.exitDate||null,exit_time:r.exitTime||null,exit_at:dateTimeIso(r.exitDate,r.exitTime),
      status:r.status||'inside',authorization_status:kind==='pessoas'?(r.authorization||'pending'):null,
      authorization_date:r.authorizationDate||null,authorization_time:r.authorizationTime||null,
      authorization_at:dateTimeIso(r.authorizationDate,r.authorizationTime),
      guard_name:r.guardName||state.guardName||'',guard_number:r.guardNumber||state.guardNumber||''
    };
  }

  function fromRow(row){
    const base={id:row.id,entryDate:row.entry_date,entryTime:String(row.entry_time||'').slice(0,5),entryAt:row.entry_at||'',exitDate:row.exit_date||'',exitTime:String(row.exit_time||'').slice(0,5),exitAt:row.exit_at||'',status:row.status,guardName:row.guard_name||'',guardNumber:row.guard_number||'',createdAt:new Date(row.created_at).getTime(),updatedAt:new Date(row.updated_at).getTime(),createdBy:row.created_by||''};
    if(row.kind==='viaturas')return {kind:row.kind,record:normalizeVehicle({...base,plate:row.vehicle_plate,persons:row.vehicle_persons,company:row.company,destination:row.destination})};
    if(row.kind==='pessoas')return {kind:row.kind,record:normalizePerson({...base,names:row.person_name,company:row.company,destination:row.destination,activity:row.activity,authorization:row.authorization_status,authorizationDate:row.authorization_date||'',authorizationTime:String(row.authorization_time||'').slice(0,5),authorizationAt:row.authorization_at||''})};
    return {kind:'estafetas',record:normalizeCourier({...base,name:row.person_name,destination:row.destination,platform:row.platform})};
  }

  function allRows(){
    return [
      ...state.courierRecords.map(r=>toRow('estafetas',r)),
      ...state.vehicleRecords.map(r=>toRow('viaturas',r)),
      ...state.personRecords.map(r=>toRow('pessoas',r))
    ];
  }

  async function syncNow(){
    if(applyingRemote||!state.cloudReady||!navigator.onLine)return;
    const rows=allRows();
    if(!rows.length){clearRecordCache();return}
    state.syncing=true;setSyncStatus('A sincronizar','pending');
    const {error}=await client.from('movements').upsert(rows,{onConflict:'id'});
    state.syncing=false;
    if(error){setSyncStatus('Alterações pendentes','pending');console.error('Falha de sincronização:',error.message);return}
    clearRecordCache();setSyncStatus('Tempo real ativo','online');
  }

  function scheduleSync(){
    if(applyingRemote||!state.cloudReady)return;
    clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,220);
  }

  async function loadRemote(){
    if(!state.cloudReady)return;
    const {data,error}=await client.from('movements').select('*').is('deleted_at',null).order('entry_at',{ascending:true}).limit(5000);
    if(error){setSyncStatus('Falha ao atualizar','offline');console.error('Falha ao carregar movimentos:',error.message);return}
    applyingRemote=true;
    state.courierRecords=[];state.vehicleRecords=[];state.personRecords=[];
    (data||[]).forEach(row=>{const item=fromRow(row);if(item.kind==='viaturas')state.vehicleRecords.push(item.record);else if(item.kind==='pessoas')state.personRecords.push(item.record);else state.courierRecords.push(item.record)});
    applyingRemote=false;clearRecordCache();renderAll();setSyncStatus('Tempo real ativo','online');
  }

  function subscribe(){
    if(channel)client.removeChannel(channel);
    channel=client.channel(`movements-${state.siteId}`).on('postgres_changes',{event:'*',schema:'public',table:'movements',filter:`site_id=eq.${state.siteId}`},()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(loadRemote,180)}).subscribe(status=>{
      if(status==='SUBSCRIBED')setSyncStatus('Tempo real ativo','online');
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setSyncStatus('Ligação instável','pending');
    });
  }

  function applyProfile(profile,user){
    state.cloudReady=true;state.currentUserId=user.id;state.userRole=profile.role;state.siteId=profile.site_id;state.profileName=profile.display_name||user.email||'';
    if(profile.role==='guard'){
      if(profile.display_name)state.guardName=profile.display_name;
      if(profile.employee_number)state.guardNumber=profile.employee_number;
    }
    document.body.dataset.cloudRole=profile.role;hideAuth();switchModule(state.module);resetIdleTimer();
  }

  async function handleSession(session){
    if(!session?.user){state.cloudReady=false;showAuth();return}
    setSyncStatus('A validar acesso','pending');
    const {data:profile,error}=await client.from('profiles').select('user_id,site_id,role,display_name,employee_number,active').eq('user_id',session.user.id).single();
    if(error||!profile){state.cloudReady=false;showAuth('A conta ainda não tem um perfil no Registo Cais. Contacte a administração.');return}
    if(!profile.active){state.cloudReady=false;showAuth('A conta aguarda ativação pela administração.');return}
    applyProfile(profile,session.user);
    await syncNow();await loadRemote();subscribe();
    if(profile.role==='guard'&&(!state.guardName||!state.guardNumber))setTimeout(()=>openGuardSetup(false),250);
  }

  async function signIn(){
    const email=$('authEmail').value.trim(),password=$('authPassword').value;
    if(!email||!password)return;
    $('loginBtn').disabled=true;$('authMessage').textContent='A validar credenciais…';
    const {data,error}=await client.auth.signInWithPassword({email,password});
    $('loginBtn').disabled=false;$('authPassword').value='';
    if(error){$('authMessage').textContent='Não foi possível iniciar sessão. Confirme o email e a palavra-passe.';return}
    $('authMessage').textContent='';await handleSession(data.session);
  }

  async function signOut(){
    if(channel){await client.removeChannel(channel);channel=null}
    await client.auth.signOut();clearRecordCache();state.cloudReady=false;state.currentUserId='';state.userRole='';state.siteId='';state.profileName='';state.courierRecords=[];state.vehicleRecords=[];state.personRecords=[];renderAll();showAuth('Sessão terminada com segurança.');
  }

  function resetIdleTimer(){
    clearTimeout(idleTimer);if(!state.cloudReady)return;
    idleTimer=setTimeout(signOut,30*60*1000);
  }

  async function init(){
    if(!client){showAuth('Não foi possível carregar a ligação segura. Atualize a página.');return}
    showAuth();
    const {data}=await client.auth.getSession();
    await handleSession(data.session);
    client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showAuth();else if(event==='SIGNED_IN'&&session)setTimeout(()=>handleSession(session),0)});
    ['pointerdown','keydown','touchstart'].forEach(name=>window.addEventListener(name,resetIdleTimer,{passive:true}));
    window.addEventListener('online',()=>{setSyncStatus('A restabelecer','pending');syncNow().then(loadRemote)});
    window.addEventListener('offline',()=>setSyncStatus('Sem ligação — dados pendentes','offline'));
  }

  window.cloudApp={init,signIn,signOut,scheduleSync,loadRemote};
})();
