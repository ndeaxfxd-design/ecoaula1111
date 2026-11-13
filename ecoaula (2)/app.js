'use strict';

const cfg = window.ECO_CONFIG || {};
const connected = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const DEMO_KEY = 'ecoaula_7_botones_demo_v1'; // conserva los registros demo anteriores
const VERSION = 'eco7_indicadores_v1'; // instrumento idéntico; campos adicionales retrocompatibles
const chosen = {};
let temporaryDemoRows = [];
let demoStorageUnavailable = false;
let dbPromise, toastTimer, saved = false, currentGroup = 'Todos';
const $ = sel => document.querySelector(sel);
const esc = val => String(val ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (val, dec=1) => val === null || val === undefined || Number.isNaN(val) ? 'Sin dato' : Number(val).toLocaleString('es-BO',{maximumFractionDigits:dec});

// Encuesta por rangos y estimación educativa de TRES fuentes, no inventario completo.
// Los factores y sus límites están documentados en README.md.
const questions = [
  {id:'transporte',topic:'MOVILIDAD',title:'¿Cómo llegas normalmente a la universidad?',hint:'Selecciona el medio de transporte que utilizas con mayor frecuencia.',options:[
    {id:'pie',label:'Caminando',emoji:'🚶',value:'pie'},{id:'bici',label:'Bicicleta',emoji:'🚲',value:'bici'},
    {id:'micro',label:'Micro / bus',emoji:'🚌',value:'micro'},{id:'moto',label:'Moto',emoji:'🛵',value:'moto'},
    {id:'auto',label:'Auto / taxi',emoji:'🚗',value:'auto'}]},
  {id:'distancia',topic:'MOVILIDAD',title:'¿Qué distancia recorres de ida?',hint:'Desde tu casa hasta la universidad, sin contar el regreso.',options:[
    {id:'d1',label:'0–2 km',emoji:'📍',value:1},{id:'d2',label:'3–5 km',emoji:'🛣️',value:4},
    {id:'d3',label:'6–10 km',emoji:'🚏',value:8},{id:'d4',label:'11–20 km',emoji:'🧭',value:15.5},
    {id:'d5',label:'Más de 20 km',emoji:'🌐',value:25}]},
  {id:'dias',topic:'MOVILIDAD',title:'¿Cuántos días por semana vas a la universidad?',hint:'Piensa en una semana normal de clases.',options:[
    {id:'a1',label:'1–2 días',emoji:'📆',value:1.5},{id:'a2',label:'3–4 días',emoji:'🗓️',value:3.5},
    {id:'a3',label:'5 días',emoji:'✋',value:5},{id:'a4',label:'6 días',emoji:'6️⃣',value:6},{id:'a5',label:'7 días',emoji:'7️⃣',value:7}]},
  {id:'combustible',topic:'MOVILIDAD · SOLO SI APLICA',title:'¿Qué combustible usa el auto o la moto?',hint:'Si es taxi y no lo sabes, marca «No sé».',when:a=>['auto','moto'].includes(a.transporte),options:[
    {id:'gas',label:'Gasolina',emoji:'⛽',value:'gasolina'},{id:'diesel',label:'Diésel',emoji:'🛢️',value:'diesel'},
    {id:'gnv',label:'GNV',emoji:'💨',value:'gnv'},{id:'electrico',label:'Eléctrico',emoji:'🔌',value:'electrico'},
    {id:'no_se',label:'No sé',emoji:'❔',value:'no_se'}]},
  {id:'electricidad',topic:'ELECTRICIDAD',title:'¿Cuánta electricidad consume tu hogar al mes?',hint:'Puedes encontrarlo en la factura: consumo mensual en kWh. «No sé» es válido.',options:[
    {id:'e1',label:'Menos de 50 kWh',emoji:'💡',value:25},{id:'e2',label:'50–100 kWh',emoji:'⚡',value:75},
    {id:'e3',label:'101–200 kWh',emoji:'🔋',value:150.5},{id:'e4',label:'201–300 kWh',emoji:'🏡',value:250.5},
    {id:'e5',label:'Más de 300 kWh',emoji:'🏘️',value:350},{id:'e0',label:'No sé',emoji:'❔',value:null}]},
  {id:'personas',topic:'ELECTRICIDAD',title:'¿Cuántas personas viven en tu hogar?',hint:'Incluyéndote. Para «6 o más» se usa 6 como aproximación conservadora.',options:[
    {id:'p1',label:'1 persona',emoji:'👤',value:1},{id:'p2',label:'2 personas',emoji:'👥',value:2},
    {id:'p3',label:'3 personas',emoji:'🏠',value:3},{id:'p4',label:'4 personas',emoji:'🏡',value:4},
    {id:'p5',label:'5 personas',emoji:'👨‍👩‍👧‍👦',value:5},{id:'p6',label:'6 o más',emoji:'👪',value:6}]},
  {id:'carne',topic:'ALIMENTACIÓN',title:'¿Cuántas veces por semana comes carne de res?',hint:'Cuenta almuerzos o cenas en los que comes carne de res.',options:[
    {id:'c0',label:'Nunca / 0 veces',emoji:'🥗',value:0},{id:'c1',label:'1–2 veces',emoji:'🍽️',value:1.5},
    {id:'c2',label:'3–4 veces',emoji:'🥩',value:3.5},{id:'c3',label:'5–7 veces',emoji:'🍖',value:6}]},
  {id:'porcion',topic:'ALIMENTACIÓN · SOLO SI APLICA',title:'¿Qué tamaño de porción comes normalmente?',hint:'Cantidad aproximada de carne por vez.',when:a=>a.carne!==undefined&&a.carne!=='c0',options:[
    {id:'r1',label:'Pequeña (~80 g)',emoji:'🥄',value:80},{id:'r2',label:'Mediana (~150 g)',emoji:'🍽️',value:150},
    {id:'r3',label:'Grande (~250 g)',emoji:'🍖',value:250}]}
];
const findQuestion = id => questions.find(q=>q.id===id);
const findOpt = id => findQuestion(id)?.options.find(o=>o.id===chosen[id]);
const questionVisible = q => !q.when || q.when(chosen);
const visibleQuestions = () => questions.filter(questionVisible);

function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000)}
function demoRows(){
  if(demoStorageUnavailable)return temporaryDemoRows;
  try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'[]')}
  catch{demoStorageUnavailable=true;return temporaryDemoRows}
}
function addDemo(row){
  const rows=demoRows();
  rows.push({...row,id:globalThis.crypto?.randomUUID?.()||String(Date.now()),created_at:new Date().toISOString()});
  if(demoStorageUnavailable){temporaryDemoRows=rows;return false}
  try{localStorage.setItem(DEMO_KEY,JSON.stringify(rows));return true}
  catch{demoStorageUnavailable=true;temporaryDemoRows=rows;return false}
}
async function getDb(){if(!dbPromise)dbPromise=import('https://esm.sh/@supabase/supabase-js@2.57.0').then(m=>m.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey));return dbPromise}

function metricValues(){
  const distance=findOpt('distancia')?.value;
  const days=findOpt('dias')?.value;
  const electricity=findOpt('electricidad')?.value;
  const household=findOpt('personas')?.value;
  const freq=findOpt('carne')?.value;
  const portion=freq===0?0:findOpt('porcion')?.value;
  return {
    traslado_km_semana: Math.round(distance*2*days*10)/10,
    electricidad_kwh_persona_mes: electricity===null?null:Math.round(electricity/household*10)/10,
    res_kg_semana: Math.round(freq*portion/1000*100)/100
  };
}

// Factores de referencia transparentes; NO constituyen un factor boliviano de movilidad.
// Unidades: kg CO2e por pasajero-km (micro) o vehículo-km (auto/moto).
// Reino Unido DESNZ/DEFRA 2026, factor bus promedio 0.10151; auto gasolina
// 0.16152, diesel 0.17265; moto promedio gasolina 0.11367.
// Electricidad: Bolivia 2025 ~0.481 kg CO2e/kWh de generación (Ember/OWID).
// Res: 99.48 kg CO2e/kg producto, promedio global res de ganado cárnico
// (Poore & Nemecek, vía Our World in Data). No extrapolar a la huella total.
const FACTORS = Object.freeze({
  bus:0.10151, autoGas:0.16152, autoDiesel:0.17265,
  motoGas:0.11367, electricidadBo:0.481, resGlobal:99.48,
  autoElectricoKwhKm:0.2171 // proxy Energy Saving Trust, multiplicar por red BO
});
const WEEKS_MONTH = 52/12;
const getAnswerValue=(answers,qid)=>findQuestion(qid)?.options.find(x=>x.id===answers?.[qid])?.value;
const round1=v=>v===null?null:Math.round(v*10)/10;

function estimateImpact(answers){
  const kmIda=getAnswerValue(answers,'distancia');
  const dias=getAnswerValue(answers,'dias');
  const kmMonth=kmIda*2*dias*WEEKS_MONTH;
  let transportFactor=null;
  const mode=answers?.transporte, fuel=answers?.combustible;
  if(mode==='pie'||mode==='bici')transportFactor=0; // emisiones operativas del trayecto
  if(mode==='micro')transportFactor=FACTORS.bus;
  if(mode==='auto'&&fuel==='gas')transportFactor=FACTORS.autoGas;
  if(mode==='auto'&&fuel==='diesel')transportFactor=FACTORS.autoDiesel;
  if(mode==='auto'&&fuel==='electrico')transportFactor=FACTORS.autoElectricoKwhKm*FACTORS.electricidadBo;
  if(mode==='moto'&&fuel==='gas')transportFactor=FACTORS.motoGas;
  // GNV, combustible desconocido y motos eléctricas/diésel: no se asigna factor inventado.
  const kwh=getAnswerValue(answers,'electricidad');
  const people=getAnswerValue(answers,'personas');
  const beefFreq=getAnswerValue(answers,'carne');
  const beefPortion=beefFreq===0?0:getAnswerValue(answers,'porcion');
  const beefKgWeek=beefFreq*beefPortion/1000;
  const transport=transportFactor===null?null:round1(kmMonth*transportFactor);
  const electricity=kwh===null||kwh===undefined?null:round1(kwh/people*FACTORS.electricidadBo);
  const food=round1(beefKgWeek*WEEKS_MONTH*FACTORS.resGlobal);
  const allComplete=[transport,electricity,food].every(v=>v!==null&&Number.isFinite(v));
  const available=[transport,electricity,food].filter(v=>v!==null&&Number.isFinite(v));
  return {
    transporte_co2e_mes:transport,
    electricidad_co2e_mes:electricity,
    res_co2e_mes:food,
    subtotal_co2e_mes:round1(available.reduce((a,b)=>a+b,0)),
    subtotal_completo:allComplete,
    metodo_emisiones:'EcoAula educativo 2026 (UK DESNZ 2026 + Bolivia Ember 2025 + OWID global res)'
  };
}
function impactForRow(row){
  // Siempre recalcular desde las respuestas: los datos viejos tienen el mismo cuestionario.
  return estimateImpact(row.respuestas||{});
}
function fmtImpact(v){return v===null||!Number.isFinite(v)?'Sin estimación':`${fmt(v)} kg`}
function displayImpact(row){
  const imp=impactForRow(row);
  const items=[
    {key:'transporte_co2e_mes',name:'Transporte',emoji:'🚌',desc:'Ida y vuelta a la universidad',klass:'transport'},
    {key:'electricidad_co2e_mes',name:'Electricidad',emoji:'⚡',desc:'Consumo del hogar dividido entre habitantes',klass:'energy'},
    {key:'res_co2e_mes',name:'Carne de res',emoji:'🥩',desc:'Solo la carne de res declarada, no toda la alimentación',klass:'food'}
  ];
  const positiveTotal=imp.subtotal_co2e_mes;
  const subtotalDisplay=imp.subtotal_completo?fmt(positiveTotal):(positiveTotal>0?fmt(positiveTotal):'—');
  const main=items.filter(it=>imp[it.key]!==null).sort((a,b)=>imp[b.key]-imp[a.key])[0];
  const lines=items.map(it=>{
    const value=imp[it.key], pct=value===null||positiveTotal===0?0:Math.round(100*value/positiveTotal);
    return `<div class="impact-row"><div class="impact-label"><span class="impact-emoji">${it.emoji}</span><span><b>${it.name}</b><small>${it.desc}</small></span></div>
      <div class="impact-numbers"><strong>${fmtImpact(value)}</strong><span>${value===null?'Pendiente':pct+'% del subtotal'}</span></div>
      <div class="impact-track-long"><div class="impact-bar ${it.klass}" style="width:${pct}%"></div></div></div>`;
  }).join('');
  const note=imp.subtotal_completo?
    'Se pudieron estimar las tres actividades del cuestionario.':
    'Estimación parcial: alguna actividad quedó sin factor o fue respondida «No sé». El subtotal no incluye esa actividad.';
  return `<div class="impact-panel"><div class="impact-panel-head"><div><span class="section-label">TU IMPACTO ESTIMADO</span><h4>¿De dónde vienen tus emisiones?</h4></div><div class="impact-subtotal"><strong>${subtotalDisplay}</strong><small>${imp.subtotal_completo?'kg CO₂e/mes*':positiveTotal>0?'kg CO₂e/mes (parcial)*':'Subtotal no disponible'}</small></div></div>
    <div class="impact-explainer">*Subtotal <b>orientativo</b> de las actividades medidas, <b>no tu huella de carbono total</b>. Cuando faltan respuestas, el subtotal es parcial o no se muestra.</div>
    <div class="impact-breakdown">${lines}</div>
    ${main&&imp[main.key]>0?`<p class="impact-highlight">💡 En las actividades medidas, <b>${main.name.toLowerCase()}</b> tiene la mayor participación estimada.</p>`:''}
    <p class="impact-missing">${note} Los rangos se calculan con valores aproximados. Caminar y pedalear se consideran con emisiones operativas de desplazamiento iguales a cero; otros impactos no están incluidos.</p>
    <details class="impact-details"><summary>¿Cómo se obtuvo el resultado?</summary><p>Transporte: kilómetros estimados × factor por medio y combustible. Electricidad: kWh del hogar ÷ personas × 0,481 kg CO₂e/kWh (Bolivia 2025). Res: kg de carne estimados × 99,48 kg CO₂e/kg (referencia mundial, muy variable). Se usa un mes medio de 52/12 semanas. Los factores de transporte provienen del Reino Unido 2026 y pueden diferir de los vehículos y micros en Bolivia. Los viajes en auto se asignan a un solo ocupante. No se miden otras comidas, residuos, agua ni fabricación de vehículos.</p><p><a href="https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026" target="_blank" rel="noopener noreferrer">Fuente: DESNZ/DEFRA 2026</a> · <a href="https://ember-energy.org/data/electricity-data-explorer/" target="_blank" rel="noopener noreferrer">Ember Bolivia</a> · <a href="https://ourworldindata.org/grapher/ghg-per-kg-poore" target="_blank" rel="noopener noreferrer">Our World in Data</a></p></details>
  </div>`;
}

function buildQuestions(){
  $('#questions').innerHTML=questions.map((q,i)=>`<section class="question-card" data-question="${q.id}" aria-invalid="false" ${questionVisible(q)?'':'hidden'}>
    <div class="question-top"><span class="question-num">${String(i+1).padStart(2,'0')} · ${esc(q.topic)}</span><span class="question-topic">${q.when?'Condicional':'Respuesta con botón'}</span></div>
    <h3>${esc(q.title)}</h3><p class="hint">${esc(q.hint)}</p>
    <div class="options" role="radiogroup" aria-label="${esc(q.title)}">${q.options.map(o=>`<label class="option"><input type="radio" name="${q.id}" value="${o.id}" ${chosen[q.id]===o.id?'checked':''}>
      <span class="option-emoji" aria-hidden="true">${o.emoji}</span><span class="option-text">${esc(o.label)}</span><span class="option-check" aria-hidden="true">✓</span></label>`).join('')}</div>
  </section>`).join('');
  updateVisibility();
}
function updateProgress(){const visible=visibleQuestions();const n=visible.filter(q=>!!chosen[q.id]).length;$('#progressCount').textContent=`${n} de ${visible.length}`;$('#progressFill').style.width=`${100*n/visible.length}%`}
function updateVisibility(){
  let number = 0;for(const q of questions){const visible=questionVisible(q);const card=document.querySelector(`[data-question="${q.id}"]`);card.hidden=!visible;if(visible){number++;card.querySelector('.question-num').textContent=`${String(number).padStart(2,'0')} · ${q.topic}`;}else{delete chosen[q.id];card.querySelectorAll('input').forEach(i=>i.checked=false)}}
  updateProgress();
}
function validationError(message,element){
  document.querySelectorAll('.inline-error').forEach(el=>el.remove());
  $('#surveyError').textContent=message;
  if(element){
    const msg=document.createElement('p');msg.className='inline-error';msg.setAttribute('role','alert');msg.textContent=message;
    element.insertAdjacentElement('afterend',msg);
    element.scrollIntoView({behavior:'smooth',block:'center'});
  }
  return null;
}
function validate(){
  const codigo=$('#studentCode').value.trim().toUpperCase(), grupo=$('#classGroup').value.trim();
  document.querySelectorAll('.inline-error').forEach(el=>el.remove());
  if(!/^[A-Z0-9_-]{3,20}$/.test(codigo))return validationError('Escribe un código de alumno de 3 a 20 letras o números.',$('#studentCode'));
  if(grupo.length<2||grupo.length>40)return validationError('Escribe tu curso o paralelo.',$('#classGroup'));
  const missing=visibleQuestions().find(q=>!chosen[q.id]);
  if(missing){const card=document.querySelector(`[data-question="${missing.id}"]`);card.setAttribute('aria-invalid','true');return validationError('Selecciona una opción para continuar.',card.querySelector('.hint'))}
  if(!$('#consent').checked)return validationError('Marca la casilla de autorización antes de enviar.',$('.consent'));
  return {codigo,grupo};
}
function getAnswers(){return Object.fromEntries(questions.map(q=>[q.id,questionVisible(q)?(chosen[q.id]||null):null]))}
function labelFor(id,optionId){return findQuestion(id)?.options.find(o=>o.id===optionId)?.label||'No aplica'}
async function sendSurvey(event){
  event.preventDefault();if(saved)return;
  const details=validate();if(!details)return;
  const metrics={...metricValues(),...estimateImpact(getAnswers())};
  const row={codigo_alumno:details.codigo,grupo:details.grupo,instrumento_version:VERSION,respuestas:getAnswers(),indicadores:metrics};
  const button=$('#submitSurvey');button.disabled=true;button.textContent='Calculando…';$('#surveyError').textContent='';
  let stored=false, saveError='';
  try{
    if(connected){
      const db=await getDb();const {data:sessionData,error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
      let session=sessionData.session;
      if(!session){const signed=await db.auth.signInAnonymously();if(signed.error)throw signed.error;session=signed.data.session}
      if(!session?.user?.id)throw new Error('No se pudo crear la sesión para enviar la encuesta.');
      if(!session.user.is_anonymous)throw new Error('Hay una sesión docente abierta en este navegador. Usa una ventana privada para responder.');
      const {error}=await db.from('encuestas_v2').insert({...row,student_id:session.user.id});if(error)throw error;
      stored=true;
    }else{
      stored=addDemo(row);
    }
  }catch(error){
    saveError=error?.code==='23505'?'Este código ya tiene una respuesta registrada en el curso.':error?.message||'No se pudo guardar la respuesta.';
  }finally{
    // El alumno obtiene siempre el resultado, aunque la vista previa bloquee localStorage.
    saved=!connected||stored;
    showResult(row,stored,saveError);
    notify(stored?(connected?'Respuesta registrada correctamente':'Respuesta guardada en este navegador'):'Resultado calculado. Atención: no quedó guardado.');
    button.disabled=false;button.textContent='Enviar y ver mi impacto aquí ↓';
  }
}
function showResult(row,stored=true,saveError=''){
  $('#surveyArea').hidden=false;$('#resultArea').hidden=false;
  $('#surveyForm').classList.add('survey-submitted');
  $('#surveyForm').querySelectorAll('input,button').forEach(el=>{el.disabled=true});
  $('.submit-card').hidden=true;
  const m=row.indicadores;
  const saveNotice=stored
    ? (connected?'<div class="notice">✅ Tus respuestas están guardadas para el análisis estadístico del docente autorizado.</div>':'<div class="notice warn">🧪 Modo demostración: tus respuestas solo están guardadas en este navegador. Para reunir datos de distintos celulares, conecta Supabase.</div>')
    : (connected?`<div class="notice warn"><b>⚠️ Tus resultados sí se calcularon, pero la respuesta NO fue guardada.</b> ${esc(saveError)} Puedes volver a intentar el envío.</div>`:'<div class="notice warn"><b>⚠️ Vista previa:</b> el navegador bloqueó el almacenamiento. Puedes ver tu resultado, pero la respuesta solo estará disponible mientras mantengas esta página abierta. No se enviará al docente.</div>');
  $('#resultArea').innerHTML=`<div class="result-card"><div class="result-icon">🌿</div><h3>¡Ya tienes tus resultados!</h3><p>Participante <b>${esc(row.codigo_alumno)}</b> · ${esc(row.grupo)}</p>
    ${displayImpact(row)}
    <div class="summary-original"><h4>Datos detrás del cálculo</h4><div class="summary-metrics"><div class="metric-tile"><strong>${fmt(m.traslado_km_semana)}</strong><small>km de traslado por semana (ida y vuelta)</small></div>
    <div class="metric-tile"><strong>${fmt(m.electricidad_kwh_persona_mes)}</strong><small>kWh/mes asignados por persona del hogar</small></div>
    <div class="metric-tile"><strong>${fmt(m.res_kg_semana,2)}</strong><small>kg de carne de res estimados por semana</small></div></div></div>
    ${saveNotice}
    <div class="result-actions">${connected&&!stored?'<button type="button" class="btn btn-primary" id="retrySave">Reintentar guardar</button>':''}${connected?'':'<button type="button" class="btn btn-outline" id="anotherSurvey">Probar otra encuesta</button>'}</div></div>`;
  $('#anotherSurvey')?.addEventListener('click',()=>{saved=false;Object.keys(chosen).forEach(k=>delete chosen[k]);$('#surveyForm').reset();$('#surveyForm').classList.remove('survey-submitted');$('#surveyForm').querySelectorAll('input,button').forEach(el=>el.disabled=false);$('.submit-card').hidden=false;$('#surveyArea').hidden=false;$('#resultArea').hidden=true;buildQuestions();$('#encuesta').scrollIntoView({behavior:'smooth'})});
  $('#retrySave')?.addEventListener('click',()=>{if(!saved)sendSurvey({preventDefault(){}})});
  $('#resultArea').scrollIntoView({behavior:'smooth',block:'start'});
}

const avg=ns=>ns.length?ns.reduce((s,x)=>s+x,0)/ns.length:null;
const median=ns=>{if(!ns.length)return null;const x=[...ns].sort((a,b)=>a-b),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};
const std=ns=>{if(!ns.length)return null;const mean=avg(ns);return Math.sqrt(ns.reduce((s,x)=>s+(x-mean)**2,0)/ns.length)};
const vals=(rows,key)=>rows.map(r=>r.indicadores?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));
function csvFile(rows){
  const cols=[['created_at','Fecha'],['codigo_alumno','Código'],['grupo','Curso'],...questions.map(q=>[q.id,q.title]),
    ['traslado_km_semana','Traslado km/semana'],['electricidad_kwh_persona_mes','Electricidad kWh/mes/persona'],['res_kg_semana','Carne de res kg/semana'],
    ['transporte_co2e_mes','Transporte kg CO2e/mes (est.)'],['electricidad_co2e_mes','Electricidad kg CO2e/mes (est.)'],['res_co2e_mes','Carne res kg CO2e/mes (est.)'],['subtotal_co2e_mes','Subtotal kg CO2e/mes (est.)'],['subtotal_completo','Subtotal tres actividades completo']];
  const safe=value=>{let str=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"'};
  const lines=[cols.map(c=>safe(c[1])).join(';')];
  for(const row of rows){const metrics={...row.indicadores,...impactForRow(row)};lines.push(cols.map(([key])=>safe(questions.some(q=>q.id===key)?labelFor(key,row.respuestas?.[key]):key in metrics?metrics[key]:row[key])).join(';'))}
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
function downloadCsv(rows){if(!rows.length)return;const blob=new Blob([csvFile(rows)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`EcoAula_impacto_individual_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);notify(`${rows.length} respuestas exportadas para Excel`)}
function renderDashboard(rows,demo){
  const groups=[...new Set(rows.map(r=>r.grupo||'Sin curso'))].sort((a,b)=>a.localeCompare(b,'es'));
  if(currentGroup!=='Todos'&&!groups.includes(currentGroup))currentGroup='Todos';
  const filtered=currentGroup==='Todos'?rows:rows.filter(r=>r.grupo===currentGroup);
  const complete=filtered.filter(r=>impactForRow(r).subtotal_completo).length;
  $('#adminContent').innerHTML=`<div class="notice ${demo?'warn':''}">${demo?'<b>Demostración:</b> solo se exportan las respuestas guardadas en este navegador. Las encuestas de otros celulares no se reciben sin configurar Supabase.':'Los resultados se consultan desde Supabase y están protegidos mediante acceso docente.'}</div>
    <section class="excel-export-card"><span class="section-label">TUS RESPUESTAS RECOPILADAS</span><h3>${filtered.length} alumno${filtered.length===1?'':'s'} registrado${filtered.length===1?'':'s'}</h3><p>Descarga todas las respuestas y el impacto estimado de cada alumno en una hoja compatible con Excel. Cada fila corresponde a un alumno y las columnas incluyen respuestas, transporte, electricidad, carne de res y subtotal.</p>
      <div class="dashboard-tools"><label for="courseFilter">Curso</label><select id="courseFilter"><option value="Todos">Todos los cursos</option>${groups.map(g=>`<option value="${esc(g)}" ${g===currentGroup?'selected':''}>${esc(g)}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary" id="exportCsv" ${filtered.length?'':'disabled'}>⬇ Descargar Excel (CSV)</button>
      <button type="button" class="btn btn-outline" id="refreshData">↻ Actualizar datos</button>${demo?'':'<button type="button" class="btn btn-outline" id="logoutAdmin">Cerrar sesión</button>'}</div>
      <small>${complete} de ${filtered.length} encuestas tienen las tres estimaciones; las demás se identifican como parciales. El archivo se abre en Excel, Google Sheets o LibreOffice.</small>
    </section>
    <h3 class="preview-heading">Vista previa (últimas 5 respuestas)</h3>
    <div class="table-outer"><table class="data-table"><thead><tr><th>Código</th><th>Curso</th><th>Transporte</th><th>CO₂e/mes estimado*</th><th>Estado</th></tr></thead><tbody>${filtered.length?filtered.slice(0,5).map(r=>{const v=impactForRow(r);return `<tr><td>${esc(r.codigo_alumno)}</td><td>${esc(r.grupo)}</td><td>${esc(labelFor('transporte',r.respuestas?.transporte))}</td><td>${fmt(v.subtotal_co2e_mes)}</td><td>${v.subtotal_completo?'Calculable':'Parcial'}</td></tr>`}).join(''):'<tr><td colspan="5" class="no-data">Aún no hay respuestas para exportar.</td></tr>'}</tbody></table></div>
    <p class="admin-footnote">*Estimaciones orientativas de 3 actividades, no huella total. La descarga CSV conserva todas las respuestas y los valores calculados. Abre el archivo en Excel para crear tablas y gráficos estadísticos.</p>`;
  $('#courseFilter').addEventListener('change',e=>{currentGroup=e.target.value;renderDashboard(rows,demo)});
  $('#exportCsv').addEventListener('click',()=>downloadCsv(filtered));
  $('#refreshData').addEventListener('click',()=>demo?renderDashboard(demoRows(),true):loadDashboard());
  $('#logoutAdmin')?.addEventListener('click',async()=>{const db=await getDb();await db.auth.signOut();renderLogin()});
}
async function loadDashboard(){
  $('#adminContent').innerHTML='<p>Cargando respuestas…</p>';
  try{const db=await getDb();const rows=[];const limit=500;for(let from=0;from<20000;from+=limit){
    const {data,error}=await db.from('encuestas_v2').select('id,created_at,codigo_alumno,grupo,instrumento_version,respuestas,indicadores')
      .eq('instrumento_version',VERSION).order('created_at',{ascending:false}).range(from,from+limit-1);
    if(error)throw error;rows.push(...data);if(data.length<limit)break;
  }renderDashboard(rows,false)}catch(e){$('#adminContent').innerHTML=`<p class="error">No se pudo consultar: ${esc(e.message)}</p>`}
}
function renderLogin(message=''){
  $('#adminContent').innerHTML=`<form class="admin-form" id="loginForm"><p>Escribe el correo docente autorizado para acceder al panel privado. Recibirás un enlace de acceso.</p><label for="adminEmail">Correo del docente</label><input type="email" id="adminEmail" placeholder="docente@universidad.edu" autocomplete="email" required><p class="error" id="loginMessage">${esc(message)}</p><button class="btn btn-primary" type="submit">Enviar enlace de acceso ↗</button></form>`;
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
    try{const db=await getDb();const {error}=await db.auth.signInWithOtp({email:$('#adminEmail').value.trim(),options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
      $('#loginMessage').style.color=error?'#b74330':'#286d48';$('#loginMessage').textContent=error?error.message:'Revisa tu correo y abre el enlace. Solo personas autorizadas pueden ver los datos.';
    }catch(e){$('#loginMessage').textContent=e.message}finally{button.disabled=false}
  });
}
async function openAdmin(){const dlg=$('#adminDialog');if(!dlg.open)dlg.showModal();$('#adminContent').innerHTML='<p>Preparando descarga…</p>';
  if(!connected){renderDashboard(demoRows(),true);return}
  try{const db=await getDb();const {data,error}=await db.auth.getUser();if(error)throw error;
    if(data.user&&!data.user.is_anonymous){const access=await db.rpc('is_admin');if(access.error)throw access.error;if(access.data){await loadDashboard();return}}
    renderLogin();
  }catch(e){renderLogin(`No se pudo verificar la sesión: ${e.message}`)}
}

buildQuestions();
$('#questions').addEventListener('change',event=>{
  if(!event.target.matches('input[type="radio"]'))return;
  chosen[event.target.name]=event.target.value;
  event.target.closest('.question-card').setAttribute('aria-invalid','false');
  $('#surveyError').textContent='';document.querySelectorAll('.inline-error').forEach(el=>el.remove());updateVisibility();
});
$('#surveyForm').addEventListener('submit',sendSurvey);
$('#adminLink').addEventListener('click',openAdmin);
$('#closeAdmin').addEventListener('click',()=>$('#adminDialog').close());
$('#adminDialog').addEventListener('click',e=>{if(e.target===$('#adminDialog'))$('#adminDialog').close()});
if(!connected)document.querySelector('.intro-meta').insertAdjacentHTML('beforeend','<span>🧪 Modo demo</span>');
