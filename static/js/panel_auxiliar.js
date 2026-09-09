const tokenAux = localStorage.getItem("token");
const rolAux = localStorage.getItem("rol");
const nombreAux = localStorage.getItem("nombre") || "Auxiliar";
if (!tokenAux || rolAux !== "Auxiliar") window.location.href = "/";
document.getElementById("nombreAuxiliar").textContent = nombreAux;

let usuariosCache = [];
let fichasCache = [];

function mostrarMensaje(texto){
    const el=document.getElementById("mensajeGuardado"); el.textContent=texto; el.style.display="block";
    setTimeout(()=>el.style.display="none",2500);
}
async function api(url, options={}){
    options.headers={...(options.headers||{}),Authorization:`Bearer ${tokenAux}`};
    const r=await fetch(url,options); const data=await r.json().catch(()=>({}));
    if(r.status===401){localStorage.clear();window.location.href="/";return null;}
    if(!r.ok) throw new Error(data.mensaje||"No se pudo completar la operación.");
    return data;
}

function escAuto(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function configurarAutocompletado({inputId,listId,tipo,hiddenId=null,getExtra=()=>"",onSelect=()=>{}}){
    const input=document.getElementById(inputId), list=document.getElementById(listId);
    if(input && input.dataset.autocompleteReady) return;
    if(input) input.dataset.autocompleteReady="1";
    if(!input||!list)return;
    let timer;
    const cerrar=()=>list.classList.add("d-none");
    const buscar=async()=>{
        const q=input.value.trim();
        clearTimeout(timer);
        timer=setTimeout(async()=>{
            try{
                const extra=getExtra()||"";
                const separador=extra ? (extra.includes("?") ? "&" : "&") : "";
                const data=await api(`/auxiliar/busquedas?tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}${extra}&limite=500`)||[];
                list.innerHTML=data.length?data.map(x=>`<div class="autocomplete-item" data-id="${escAuto(x.id)}" data-text="${escAuto(x.texto)}"><strong>${escAuto(x.texto)}</strong>${x.correo?`<small class="d-block text-muted">${escAuto(x.correo)}</small>`:""}${x.categoria?`<small class="d-block text-muted">${escAuto(x.categoria)}</small>`:""}</div>`).join(""):"<div class='autocomplete-empty'>No hay coincidencias.</div>";
                list.classList.remove("d-none");
                list.querySelectorAll(".autocomplete-item").forEach(el=>el.addEventListener("mousedown",ev=>{
                    ev.preventDefault();
                    input.value=el.dataset.text;
                    if(hiddenId){document.getElementById(hiddenId).value=el.dataset.id;}
                    const seleccionado=data.find(x=>String(x.id)===String(el.dataset.id)) || {id:el.dataset.id,text:el.dataset.text};
                    onSelect(seleccionado);
                    cerrar();
                }));
            }catch(e){console.error(e);}
        },180);
    };
    input.addEventListener("input",()=>{if(hiddenId)document.getElementById(hiddenId).value="";buscar();});
    input.addEventListener("focus",buscar);
    input.addEventListener("blur",()=>setTimeout(cerrar,180));
}

async function cargarUsuarios(){
    try{
        usuariosCache=await api("/auxiliar/usuarios")||[];
        const activos=usuariosCache.filter(u=>u.estado);
        document.getElementById("totalUsuarios").textContent=activos.length;
        document.getElementById("totalInstructores").textContent=activos.filter(u=>u.rol==="Instructor").length;
        document.getElementById("tablaUsuarios").innerHTML=usuariosCache.map(u=>`<tr>
            <td><strong>${u.nombre} ${u.apellido||""}</strong></td><td>${u.correo}</td><td>${u.rol}</td>
            <td><span class="badge ${u.estado?'badge-ok':'badge-no'}">${u.estado?'Activo':'Eliminado'}</span></td>
            <td>${u.estado && u.rol!=="Administrador" ? `<button class="btn btn-sm btn-outline-sena me-1" onclick="editarUsuario(${u.id})"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" onclick="eliminarUsuario(${u.id})"><i class="fa-solid fa-trash"></i></button>` : ""}</td>
        </tr>`).join("")||`<tr><td colspan="5" class="text-center">No hay usuarios.</td></tr>`;
    }catch(e){alert(e.message)}
}

async function cargarFichas(){
    try{
        fichasCache=await api("/auxiliar/fichas")||[];
        document.getElementById("totalFichas").textContent=fichasCache.length;
        document.getElementById("totalExcel").textContent=fichasCache.filter(f=>f.importado).length;
        const select=document.getElementById("instFicha");
        select.innerHTML=fichasCache.map(f=>`<option value="${f.id}">Ficha ${f.numero}${f.programa?' - '+f.programa:''}</option>`).join("");
        cargarInstructoresSinFicha();
        document.getElementById("tablaFichas").innerHTML=fichasCache.map(f=>`<tr>
            <td><strong>${f.numero}</strong></td><td>${f.programa||""}</td><td>${f.importado?'<span class="badge badge-ok">Importado</span>':'<span class="badge badge-no">Sin Excel</span>'}</td>
            <td><div class="small">${f.fecha_inicio||""}</div><div class="small text-muted">${f.fecha_fin||""}</div><button class="btn btn-sm btn-outline-sena mt-1" onclick="abrirEditarFechas(${f.id})"><i class="fa-solid fa-calendar-days"></i> Cambiar</button></td>
            <td><input id="ficha-${f.id}" class="form-control form-control-sm" value="${f.numero}" style="max-width:180px"></td>
            <td><button class="btn btn-sm btn-sena" onclick="guardarNumeroFicha(${f.id})">Guardar</button></td>
        </tr>`).join("")||`<tr><td colspan="6" class="text-center">No hay fichas.</td></tr>`;
        document.getElementById("tablaExcel").innerHTML=fichasCache.map(f=>`<tr><td>${f.numero}</td><td>${f.programa||""}</td><td>${f.importado?'<span class="badge badge-ok">Excel importado</span>':'<span class="badge badge-no">No importado</span>'}</td><td>${f.importado?`<button class="btn btn-sm btn-outline-primary me-1" onclick="verExcel(${f.id}, '${String(f.numero).replace(/'/g,"\'")}')">Ver</button><button class="btn btn-sm btn-sena" onclick="descargarArchivoAux('/auxiliar/fichas/${f.id}/excel','plan_formacion_ficha_${String(f.numero).replace(/'/g,"\'")}.xlsx')">Descargar</button>`:'-'}</td></tr>`).join("")||`<tr><td colspan="4" class="text-center">No hay fichas.</td></tr>`;
    }catch(e){alert(e.message)}
}



function abrirEditarFechas(id){
    const f=fichasCache.find(x=>Number(x.id)===Number(id));
    if(!f)return;
    document.getElementById("fechaFichaId").value=f.id;
    document.getElementById("editarFichaInicio").value=f.fecha_inicio||"";
    document.getElementById("editarFichaFin").value=f.fecha_fin||"";
    new bootstrap.Modal(document.getElementById("modalFechasFicha")).show();
}

document.getElementById("btnGuardarFechasFicha")?.addEventListener("click",async()=>{
    const id=document.getElementById("fechaFichaId").value;
    const fecha_inicio=document.getElementById("editarFichaInicio").value;
    const fecha_fin=document.getElementById("editarFichaFin").value;
    if(!fecha_inicio||!fecha_fin){alert("Complete las dos fechas.");return;}
    try{
        const d=await api(`/auxiliar/fichas/${id}/fechas`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({fecha_inicio,fecha_fin})});
        bootstrap.Modal.getInstance(document.getElementById("modalFechasFicha")).hide();
        mostrarMensaje(d.mensaje||"Fechas actualizadas.");
        await cargarFichas();
    }catch(e){alert(e.message)}
});
async function guardarNumeroFicha(id){
    const numero=document.getElementById(`ficha-${id}`).value.trim();
    try{await api(`/auxiliar/fichas/${id}/numero`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({numero})});mostrarMensaje("Número de ficha guardado en la base de datos.");await cargarFichas();}catch(e){alert(e.message)}
}

async function eliminarUsuario(id){
    if(!confirm("¿Deseas eliminar/desactivar este usuario?"))return;
    try{await api(`/auxiliar/usuarios/${id}`,{method:"DELETE"});mostrarMensaje("Usuario desactivado y cambios guardados.");await cargarUsuarios();await cargarFichas();}catch(e){alert(e.message)}
}

function editarUsuario(id){
    const u=usuariosCache.find(x=>x.id===id); if(!u)return;
    document.getElementById("editUsuarioId").value=u.id;document.getElementById("editNombre").value=u.nombre;document.getElementById("editApellido").value=u.apellido||"";document.getElementById("editCorreo").value=u.correo;document.getElementById("editPassword").value="";
    new bootstrap.Modal(document.getElementById("modalEditarUsuario")).show();
}

document.getElementById("btnGuardarUsuario").addEventListener("click",async()=>{
    const id=document.getElementById("editUsuarioId").value;
    const payload={nombre:document.getElementById("editNombre").value.trim(),apellido:document.getElementById("editApellido").value.trim(),correo:document.getElementById("editCorreo").value.trim()};
    const pass=document.getElementById("editPassword").value;if(pass)payload.password=pass;
    try{await api(`/auxiliar/usuarios/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});bootstrap.Modal.getInstance(document.getElementById("modalEditarUsuario")).hide();mostrarMensaje("Usuario actualizado y guardado.");await cargarUsuarios();}catch(e){alert(e.message)}
});

async function cargarInstructoresSinFicha(){
    try{
        const lista=await api("/auxiliar/instructores/sin-ficha")||[];
        const select=document.getElementById("instExistente");
        if(!select)return;
        select.innerHTML='<option value="">-- Crear uno nuevo --</option>'+lista.map(i=>`<option value="${i.id}">${escAuto(i.nombre)}</option>`).join("");
    }catch(e){console.error(e)}
}

document.getElementById("instExistente")?.addEventListener("change",()=>{
    const id=document.getElementById("instExistente").value;
    const nombre=document.getElementById("instNombre");
    if(id){nombre.value="";nombre.disabled=true;}else{nombre.disabled=false;}
});

document.getElementById("btnCrearInstructor").addEventListener("click",async()=>{
    const existente=document.getElementById("instExistente").value||null;
    const nombre=document.getElementById("instNombre").value.trim();
    const id_fichas=[...document.getElementById("instFicha").selectedOptions].map(o=>o.value);
    if(!existente && !nombre){alert("Escriba el nombre del instructor o seleccione un instructor existente.");return;}
    if(!id_fichas.length){alert("Seleccione al menos una ficha.");return;}
    const payload={nombre,id_instructor:existente,id_fichas};
    try{
        await api("/auxiliar/instructores",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
        bootstrap.Modal.getInstance(document.getElementById("modalInstructor")).hide();
        document.getElementById("instNombre").value="";
        document.getElementById("instNombre").disabled=false;
        document.getElementById("instExistente").value="";
        [...document.getElementById("instFicha").options].forEach(o=>o.selected=false);
        mostrarMensaje("Instructor asignado correctamente a las fichas seleccionadas.");
        await cargarUsuarios();await cargarFichas();await cargarInstructoresSinFicha();
    }catch(e){alert(e.message)}
});

async function descargarArchivoAux(url,nombre){
    try{
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${tokenAux}`}});
        if(r.status===401){localStorage.clear();window.location.href="/";return;}
        if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.mensaje||"No se pudo descargar el archivo.");}
        const blob=await r.blob();const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=nombre||"archivo.xlsx";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
    }catch(e){alert(e.message);}
}

async function verExcel(id,numero){
    try{const data=await api(`/auxiliar/fichas/${id}/excel-data`);document.getElementById("tituloExcel").textContent=`Excel importado - Ficha ${numero}`;const rows=data.filas||[];if(!rows.length){document.getElementById("vistaExcel").innerHTML="<p class='text-muted'>No hay filas para mostrar.</p>";}else{const cols=Object.keys(rows[0]);document.getElementById("vistaExcel").innerHTML=`<table class="table table-sm table-bordered"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;}document.getElementById("btnDescargarExcel").onclick=()=>descargarArchivoAux(`/auxiliar/fichas/${id}/excel`,`plan_formacion_ficha_${numero}.xlsx`);new bootstrap.Modal(document.getElementById("modalExcel")).show();}catch(e){alert(e.message)}
}

document.getElementById("btnCrearPrograma")?.addEventListener("click", async () => {
    const payload = {
        nombre_programa: document.getElementById("programaNombre").value.trim(),
        codigo_programa: document.getElementById("programaCodigo").value.trim(),
        tipo_programa: document.getElementById("programaTipo").value,
        modalidad: document.getElementById("programaModalidad").value
    };

    if (!payload.nombre_programa || !payload.tipo_programa || !payload.modalidad) {
        alert("Complete nombre, tipo y modalidad del programa.");
        return;
    }

    try {
        const data = await api("/auxiliar/programas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        bootstrap.Modal.getInstance(document.getElementById("modalPrograma"))?.hide();
        document.getElementById("programaNombre").value = "";
        document.getElementById("programaCodigo").value = "";
        document.getElementById("programaTipo").value = "";
        document.getElementById("programaModalidad").value = "";

        mostrarMensaje("Programa creado y guardado en la base de datos.");

        // Actualiza el autocompletado de programas para que el nuevo
        // programa aparezca inmediatamente al crear una ficha.
        const input = document.getElementById("fichaPrograma");
        if (input) {
            input.value = data.programa?.nombre || "";
            document.getElementById("fichaProgramaId").value = data.programa?.id || "";
            document.getElementById("fichaCodigoPrograma").value = data.programa?.codigo || "";
            document.getElementById("fichaTipoPrograma").value = data.programa?.tipo || "";
            document.getElementById("fichaModalidad").value = data.programa?.modalidad || "";
        }
    } catch (e) {
        alert(e.message);
    }
});

document.getElementById("btnSalir").addEventListener("click",()=>{localStorage.clear();window.location.href="/"});
cargarUsuarios();cargarFichas();

// ==============================
// PLAN DE FORMACIÓN Y FICHAS
// ==============================

function llenarSelectFichas(){
    const opts='<option value="">Seleccione ficha</option>'+fichasCache.map(f=>`<option value="${f.id}">Ficha ${f.numero} - ${f.programa||''}</option>`).join('');
    const a=document.getElementById('planFicha');
    const b=document.getElementById('planNuevaFicha');
    if(a)a.innerHTML=opts;
    if(b)b.innerHTML=opts;
}

function llenarSelectInstructores(){
    const input=document.getElementById('planInstructor');
    if(input && !input.dataset.ready){
        input.dataset.ready='1';
        configurarAutocompletado({inputId:'planInstructor',listId:'planInstructorSuggestions',tipo:'instructores',hiddenId:'planInstructorId',getExtra:()=>{const id=document.getElementById('planNuevaFicha')?.value;return id?`&id_ficha=${id}`:'';}});

// Programa existente: al hacer clic se muestran los programas en orden alfabético; al escribir se filtran.
configurarAutocompletado({inputId:'fichaPrograma',listId:'fichaProgramaSuggestions',tipo:'programas',hiddenId:'fichaProgramaId',onSelect:(x)=>{
    document.getElementById('fichaCodigoPrograma').value=x.codigo||'';
    document.getElementById('fichaTipoPrograma').value=x.tipo||'';
    document.getElementById('fichaModalidad').value=x.modalidad||'';
}});
    }
}


let planRowsCache=[];
let planFaseIndex=0;
let planBusquedaAux="";
async function cargarPlan(){
    const id=document.getElementById('planFicha').value;
    if(!id){planRowsCache=[];document.getElementById('tablaPlan').innerHTML='<tr><td colspan="9" class="text-center text-muted">Seleccione una ficha.</td></tr>';document.getElementById('planFaseNav').innerHTML='';return;}
    try{planRowsCache=await api(`/auxiliar/planes?id_ficha=${id}`)||[];planFaseIndex=0;renderPlanRows(planRowsCache);}catch(e){alert(e.message)}
}
function claseEstadoAux(estado){return "";}
function renderPlanRows(rows){
    const nav=document.getElementById('planFaseNav');
    const fases=[...new Set(planRowsCache.map(x=>x.fase||'Sin fase'))];
    let base=planBusquedaAux?rows:rows.filter(p=>(p.fase||'Sin fase')===(fases[planFaseIndex]||'Sin fase'));
    if(nav){nav.innerHTML=planBusquedaAux?`<span class="badge text-bg-light border">${base.length} resultado(s)</span>`:fases.map((f,i)=>`<button class="btn btn-sm ${i===planFaseIndex?'btn-success':'btn-outline-success'}" onclick="planFaseIndex=${i};renderPlanRows(planRowsCache)">${escAuto(f)}</button>`).join('');}
    document.getElementById('tablaPlan').innerHTML=base.map(p=>`<tr class="" data-plan-id="${escAuto(p.id)}"><td>${escAuto(p.trimestre)}</td><td>${escAuto(p.orden)}</td><td>${escAuto(p.fase)}</td><td>${escAuto(p.competencia)}</td><td>${escAuto(p.resultado)}</td><td>${escAuto(p.instructor||'Sin instructor')}</td><td>${escAuto(p.horas_directas)}</td><td>${escAuto(p.horas_independientes)}</td><td>${escAuto(p.juicio_evaluacion||"Sin juicio registrado")}</td><td><button type="button" class="btn btn-sm btn-outline-danger" title="Eliminar este registro" onclick="eliminarPlanAux(${escAuto(p.id)})"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')||'<tr><td colspan="10" class="text-center text-muted">No hay coincidencias.</td></tr>';
}
function filtrarPlan(){planBusquedaAux=(document.getElementById('buscarPlan')?.value||'').trim();renderPlanRows(planRowsCache);}


async function eliminarPlanAux(id){
    if(!confirm('¿Eliminar este registro manual del plan de formación?')) return;
    try{
        await api(`/auxiliar/planes/${id}`,{method:'DELETE'});
        mostrarMensaje('Registro del plan eliminado.');
        await cargarPlan();
    }catch(e){alert(e.message)}
}

function seleccionarJuiciosEvaluativos(){
    const ficha=document.getElementById('planFicha')?.value;
    if(!ficha){alert('Seleccione primero una ficha.');return;}
    document.getElementById('archivoJuiciosEvaluativos')?.click();
}

document.getElementById('archivoJuiciosEvaluativos')?.addEventListener('change',async function(){
    const archivo=this.files?.[0];
    const ficha=document.getElementById('planFicha')?.value;
    if(!archivo || !ficha){this.value='';return;}
    const fd=new FormData(); fd.append('archivo',archivo);
    try{
        const data=await api(`/auxiliar/fichas/${ficha}/juicios-evaluativos`,{method:'POST',body:fd});
        let msg=`Juicios procesados. Coincidencias: ${data.coincidencias||0}. Estados actualizados: ${data.actualizados||0}.`;
        if(data.ignorados) msg += ` Ignorados por estado no reconocido: ${data.ignorados}.`;
        alert(msg);
        await cargarPlan();
    }catch(e){alert(e.message)}
    finally{this.value='';}
});

async function exportarPlan(){
    const id=document.getElementById('planFicha').value;
    if(!id){alert('Seleccione una ficha para exportar el plan.');return;}
    const ficha=fichasCache.find(x=>String(x.id)===String(id));
    await descargarArchivoAux(`/auxiliar/fichas/${id}/excel`, `plan_formacion_ficha_${ficha?.numero||id}.xlsx`);
}

function seleccionarPlanEvaluacion(){
    const ficha=document.getElementById('planFicha')?.value;
    if(!ficha){alert('Seleccione primero una ficha.');return;}
    document.getElementById('archivoPlanEvaluacion')?.click();
}

document.getElementById('archivoPlanEvaluacion')?.addEventListener('change',async function(){
    const archivo=this.files?.[0];
    const ficha=document.getElementById('planFicha')?.value;
    if(!archivo || !ficha){this.value='';return;}
    const fd=new FormData(); fd.append('archivo',archivo);
    try{
        const data=await api(`/auxiliar/fichas/${ficha}/plan-evaluacion`,{method:'POST',body:fd});
        mostrarMensaje(data.mensaje||'Plan de evaluación importado.');
    }catch(e){alert(e.message)}
    finally{this.value='';}
});


document.getElementById('btnCrearFicha')?.addEventListener('click',async()=>{
    const payload={
        numero:document.getElementById('fichaNumero').value.trim(),
        id_programa:document.getElementById('fichaProgramaId').value||null,
        fecha_inicio:document.getElementById('fichaInicio').value,
        fecha_fin:document.getElementById('fichaFin').value,
        notas:''
    };

    if(!payload.numero||!payload.id_programa||!payload.fecha_inicio||!payload.fecha_fin){
        alert('Complete número de ficha, seleccione un programa existente y coloque las fechas.');
        return;
    }

    try{
        const data=await api('/auxiliar/fichas',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        });

        bootstrap.Modal.getInstance(document.getElementById('modalFicha')).hide();
        limpiarFormularioFicha();
        mostrarMensaje('Ficha guardada y vinculada al programa de la base de datos.');
        await cargarFichas();
        llenarSelectFichas();
    }catch(e){alert(e.message)}
});

function limpiarFormularioFicha(){
    const ids=['fichaNumero','fichaPrograma','fichaProgramaId','fichaCodigoPrograma','fichaTipoPrograma','fichaModalidad','fichaInicio','fichaFin','fichaTrimestre'];
    ids.forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('fichaProgramaSuggestions')?.classList.add('d-none');
}

async function guardarPlanAux(descargar=false){
    const fichaId=document.getElementById('planNuevaFicha').value;
    const payload={
        id_ficha:fichaId,
        id_instructor:document.getElementById('planInstructorId').value||null,
        id_fase:document.getElementById('planFaseId').value||null,
        id_actividad_proyecto:document.getElementById('planActividadProyectoId').value||null,
        id_competencia:document.getElementById('planCompetenciaId').value||null,
        id_resultado:document.getElementById('planResultadoId').value||null,
        id_actividad_aprendizaje:document.getElementById('planActividadAprendizajeId').value||null,
        fase:document.getElementById('planFase').value.trim(),
        actividad_proyecto:document.getElementById('planActividadProyecto').value.trim(),
        competencia:document.getElementById('planCompetencia').value.trim(),
        resultado:document.getElementById('planResultado').value.trim(),
        actividad_aprendizaje:document.getElementById('planActividadAprendizaje').value.trim(),
        horas_directas:document.getElementById('planHorasDirectas').value,
        horas_independientes:document.getElementById('planHorasIndependientes').value,
        juicio_evaluacion:document.getElementById('planJuicioEvaluacion')?.value || 'SIN CALIFICAR'
    };
    if(!payload.id_ficha||!payload.competencia||!payload.resultado){alert('Ficha, competencia y resultado de aprendizaje son obligatorios.');return;}
    try{
        await api('/auxiliar/planes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        bootstrap.Modal.getInstance(document.getElementById('modalPlan')).hide();
        document.getElementById('planFicha').value=payload.id_ficha;
        mostrarMensaje(descargar?'Plan guardado. Preparando Excel...':'Plan guardado en la base de datos.');
        await cargarPlan();
        if(descargar){await descargarArchivoAux(`/auxiliar/fichas/${payload.id_ficha}/excel`,`plan_formacion_ficha_${payload.id_ficha}.xlsx`);}
    }catch(e){alert(e.message)}
}

document.getElementById('btnCrearPlan')?.addEventListener('click',()=>guardarPlanAux(false));
document.getElementById('btnCrearPlanDescargar')?.addEventListener('click',()=>guardarPlanAux(true));

// Calcula y muestra el trimestre de la ficha mientras se diligencian las fechas.
function calcularTrimestreVisual(){
    const inicio=document.getElementById('fichaInicio')?.value;
    const fin=document.getElementById('fichaFin')?.value;
    const salida=document.getElementById('fichaTrimestre');
    if(!salida)return;
    if(!inicio||!fin){salida.value='';return;}
    const ini=new Date(inicio+'T00:00:00');
    const fechaFin=new Date(fin+'T00:00:00');
    if(Number.isNaN(ini.getTime())||Number.isNaN(fechaFin.getTime())||fechaFin<ini){salida.value='';return;}
    const hoy=new Date();
    let referencia=hoy;
    if(referencia<ini) referencia=ini;
    if(referencia>fechaFin) referencia=fechaFin;
    let meses=(referencia.getFullYear()-ini.getFullYear())*12+(referencia.getMonth()-ini.getMonth());
    if(referencia.getDate()<ini.getDate()) meses--;
    let trimestre=Math.max(1,Math.floor(meses/3)+1);
    let totalMeses=(fechaFin.getFullYear()-ini.getFullYear())*12+(fechaFin.getMonth()-ini.getMonth());
    if(fechaFin.getDate()<ini.getDate()) totalMeses--;
    const totalTrimestres=Math.max(1,Math.ceil((totalMeses+1)/3));
    trimestre=Math.min(trimestre,totalTrimestres);
    salida.value=`Trimestre ${trimestre}`;
}

document.getElementById('fichaInicio')?.addEventListener('change',calcularTrimestreVisual);
document.getElementById('fichaFin')?.addEventListener('change',calcularTrimestreVisual);

document.getElementById('planNuevaFicha')?.addEventListener('change',function(){
    const ficha=fichasCache.find(x=>String(x.id)===String(this.value));
    const campo=document.getElementById('planTrimestre');
    if(campo)campo.value=ficha?.trimestre ? `Trimestre ${ficha.trimestre}` : '';
});

document.getElementById('modalPlan')?.addEventListener('show.bs.modal',function(){
    const select=document.getElementById('planNuevaFicha');
    const campo=document.getElementById('planTrimestre');
    const ficha=fichasCache.find(x=>String(x.id)===String(select?.value));
    if(campo)campo.value=ficha?.trimestre ? `Trimestre ${ficha.trimestre}` : '';
});

// Cuando se cargan los datos iniciales, llenar los nuevos selectores.
const _cargarUsuariosOriginal=cargarUsuarios;
cargarUsuarios=async function(){await _cargarUsuariosOriginal();llenarSelectInstructores();};
const _cargarFichasOriginal=cargarFichas;
cargarFichas=async function(){await _cargarFichasOriginal();llenarSelectFichas();};

configurarAutocompletado({inputId:'planFase',listId:'planFaseSuggestions',tipo:'fases',hiddenId:'planFaseId'});
configurarAutocompletado({inputId:'planActividadProyecto',listId:'planActividadProyectoSuggestions',tipo:'actividades_proyecto',hiddenId:'planActividadProyectoId'});
configurarAutocompletado({inputId:'planCompetencia',listId:'planCompetenciaSuggestions',tipo:'competencias',hiddenId:'planCompetenciaId',onSelect:()=>{document.getElementById('planResultado').value='';document.getElementById('planResultadoId').value='';}});
configurarAutocompletado({inputId:'planResultado',listId:'planResultadoSuggestions',tipo:'resultados',hiddenId:'planResultadoId',getExtra:()=>{const id=document.getElementById('planCompetenciaId')?.value;return id?`&id_competencia=${id}`:'';}});
configurarAutocompletado({inputId:'planActividadAprendizaje',listId:'planActividadSuggestions',tipo:'actividades',hiddenId:'planActividadAprendizajeId',getExtra:()=>{const id=document.getElementById('planNuevaFicha')?.value;return id?`&id_ficha=${id}`:'';}});
configurarAutocompletado({inputId:'planInstructor',listId:'planInstructorSuggestions',tipo:'instructores',hiddenId:'planInstructorId',getExtra:()=>{const id=document.getElementById('planNuevaFicha')?.value;return id?`&id_ficha=${id}`:'';}});


async function cargarInstructoresSistema(){
    try{
        const lista=await api('/auxiliar/instructores')||[];
        const tbody=document.getElementById('tablaInstructoresSistema');
        if(!tbody)return;
        tbody.innerHTML=lista.map(i=>`<tr><td><strong>${escAuto(i.nombre)}</strong></td><td>${escAuto(i.fichas||'Sin fichas asignadas')}</td><td>${i.cuenta?`<span class="badge badge-ok">${escAuto(i.cuenta)}</span>`:'<span class="text-muted">Sin cuenta</span>'}</td></tr>`).join('')||'<tr><td colspan="3" class="text-center text-muted">No hay instructores registrados.</td></tr>';
    }catch(e){console.error(e)}
}

cargarUsuarios();
cargarFichas();
cargarInstructoresSistema();
