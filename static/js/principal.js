/* =====================================================
   PRINCIPAL.JS
   Gestión de ficha, plan de formación y horario
===================================================== */


/* =====================================================
   1. SESIÓN Y DATOS DEL USUARIO
===================================================== */

const token = localStorage.getItem("token");
const idFicha = localStorage.getItem("id_ficha");
const rol = localStorage.getItem("rol");
const nombreUsuario = localStorage.getItem("nombre");

let instructoresFicha = [];


/* =====================================================
   2. VERIFICAR SESIÓN
===================================================== */

if (!token) {
    window.location.href = "/";
}


/* =====================================================
   3. VERIFICAR FICHA
===================================================== */

if (!idFicha) {
    alert("No se ha seleccionado ninguna ficha.");
    window.location.href = "/";
}


/* =====================================================
   4. SESIÓN EXPIRADA
===================================================== */

function sesionExpirada() {
    localStorage.removeItem("token");
    localStorage.removeItem("id_usuario");
    localStorage.removeItem("nombre");
    localStorage.removeItem("rol");
    localStorage.removeItem("id_ficha");

    alert("Tu sesión ha expirado. Por favor inicia sesión nuevamente.");

    window.location.href = "/";
}


/* =====================================================
   5. MOSTRAR USUARIO
===================================================== */

const nombreUsuarioElemento = document.getElementById("nombreUsuario");

if (nombreUsuarioElemento) {
    nombreUsuarioElemento.textContent = nombreUsuario || "Usuario";
}


/* =====================================================
   6. UTILIDADES
===================================================== */

function convertirFecha(fecha) {
    if (!fecha) return null;

    const partes = fecha.split("/");

    if (partes.length !== 3) return null;

    return new Date(
        Number(partes[2]),
        Number(partes[1]) - 1,
        Number(partes[0])
    );
}


function normalizarPlan(valor) {
    return String(valor ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}


function setText(id, value) {
    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = value;
    }
}


function escHorario(value) {
    return String(value ?? "").replace(
        /[&<>'"]/g,
        caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        })[caracter]
    );
}


function escImport(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]
    );
}


function escAutoPrincipal(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[caracter]
    );
}


/* =====================================================
   7. INFORMACIÓN DE LA FICHA
===================================================== */

async function cargarFicha() {

    try {

        const respuesta = await fetch(
            `/ficha/${idFicha}`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            const error = await respuesta.json();

            alert(
                error.mensaje ||
                "No se pudo cargar la ficha."
            );

            return;
        }


        const ficha = await respuesta.json();


        /*
           Una ficha vencida queda visible,
           pero el instructor no puede realizar cargas.
        */

        if (rol === "Instructor" && ficha.estado !== "Activa") {

            alert(
                `No puedes realizar cargas en esta ficha. ` +
                `La ficha está ${ficha.estado.toLowerCase()}.`
            );

        } else if (rol === "Instructor") {

            const hoy = new Date();

            hoy.setHours(0, 0, 0, 0);

            const fin = convertirFecha(ficha.fecha_fin);
            const inicio = convertirFecha(ficha.fecha_inicio);


            if (
                (inicio && hoy < inicio) ||
                (fin && hoy > fin)
            ) {

                alert(
                    `No puedes realizar cargas porque las fechas ` +
                    `de la ficha no están vigentes. ` +
                    `La ficha va del ${ficha.fecha_inicio} ` +
                    `al ${ficha.fecha_fin}.`
                );
            }
        }


        setText(
            "numeroFicha",
            ficha.numero_ficha
        );

        setText(
            "nombrePrograma",
            ficha.nombre_programa ||
            "Sin programa asignado"
        );

        setText(
            "fechaInicio",
            ficha.fecha_inicio
        );

        setText(
            "fechaFin",
            ficha.fecha_fin
        );

        setText(
            "duracion",
            calcularDuracion(
                ficha.fecha_inicio,
                ficha.fecha_fin
            )
        );

        setText(
            "tiempoTranscurrido",
            calcularTiempoTranscurrido(
                ficha.fecha_inicio,
                ficha.fecha_fin
            )
        );

    } catch (error) {

        console.error(error);

        alert("Error al cargar la ficha.");
    }
}


/* =====================================================
   8. DURACIÓN DE LA FICHA
===================================================== */

function calcularDuracion(inicio, fin) {

    const fechaInicio = convertirFecha(inicio);
    const fechaFin = convertirFecha(fin);

    if (!fechaInicio || !fechaFin) {
        return "0 meses";
    }

    let meses =
        (fechaFin.getFullYear() -
            fechaInicio.getFullYear()) * 12;

    meses +=
        fechaFin.getMonth() -
        fechaInicio.getMonth();

    return `${meses} meses`;
}


/* =====================================================
   9. AVANCE Y TIEMPO TRANSCURRIDO
===================================================== */

let porcentajeEsperadoGlobal = 0;
let porcentajeRealGlobal = 0;


function actualizarDiferencia() {

    const elemento =
        document.getElementById("diferencia");

    if (!elemento) return;


    const diferencia =
        porcentajeRealGlobal -
        porcentajeEsperadoGlobal;


    elemento.textContent =
        (diferencia > 0 ? "+" : "") +
        diferencia +
        "%";


    elemento.classList.remove(
        "text-danger",
        "text-success",
        "text-warning"
    );


    elemento.classList.add(
        diferencia < 0
            ? "text-danger"
            : "text-success"
    );
}


function calcularTiempoTranscurrido(inicio, fin) {

    const fechaInicio = convertirFecha(inicio);
    const fechaFin = convertirFecha(fin);

    if (!fechaInicio || !fechaFin) {
        return "0 meses y 0 días (0%)";
    }


    const hoy = new Date();

    hoy.setHours(0, 0, 0, 0);


    const totalDias = Math.max(
        1,
        Math.round(
            (fechaFin - fechaInicio) /
            86400000
        )
    );


    const transcurridos = Math.max(
        0,
        Math.min(
            totalDias,
            Math.round(
                (hoy - fechaInicio) /
                86400000
            )
        )
    );


    const porcentaje = Math.round(
        (transcurridos / totalDias) * 100
    );


    const esperado =
        document.getElementById(
            "avanceEsperado"
        );

    const barra =
        document.getElementById(
            "barraEsperado"
        );


    if (esperado) {
        esperado.textContent =
            porcentaje + "%";
    }


    if (barra) {
        barra.style.width =
            porcentaje + "%";
    }


    porcentajeEsperadoGlobal =
        porcentaje;


    actualizarDiferencia();


    const meses =
        Math.floor(
            transcurridos / 30.44
        );


    const dias =
        Math.round(
            transcurridos -
            (meses * 30.44)
        );


    return `${meses} meses y ${Math.max(
        0,
        dias
    )} días (${porcentaje}%)`;
}


/* =====================================================
   10. INSTRUCTORES DE LA FICHA
===================================================== */

async function cargarInstructoresFicha() {

    try {

        const respuesta = await fetch(
            `/actividades/instructores/${idFicha}`,
            {
                method: "GET",
                headers: {
                    "Authorization":
                        `Bearer ${token}`
                }
            }
        );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {
            instructoresFicha = [];
            return;
        }


        instructoresFicha =
            await respuesta.json();

    } catch (error) {

        console.error(
            "ERROR CARGANDO INSTRUCTORES:",
            error
        );

        instructoresFicha = [];
    }
}


/* =====================================================
   11. PLAN DE FORMACIÓN
===================================================== */

let actividadesCache = [];
let faseActualIndex = 0;
let planBusqueda = "";


/* =====================================================
   FILTRAR PLAN
===================================================== */

function actividadesFiltradas() {

    if (!planBusqueda) {
        return actividadesCache;
    }


    return actividadesCache.filter(
        actividad => {

            const texto = [
                actividad.fase,
                actividad.actividad_proyecto,
                actividad.competencia,
                actividad.resultado,
                actividad.actividad_aprendizaje,
                actividad.instructor,
                actividad.juicio_evaluacion,
                actividad.trimestre,
                actividad.orden,
                actividad.horas_directas,
                actividad.horas_independientes
            ].join(" ");


            return normalizarPlan(texto)
                .includes(
                    normalizarPlan(planBusqueda)
                );
        }
    );
}


/* =====================================================
   NAVEGACIÓN POR FASES
===================================================== */

function renderNavegacionFases(lista) {

    const navegacion =
        document.getElementById(
            "navegacionFases"
        );

    if (!navegacion) return;


    if (planBusqueda) {

        navegacion.innerHTML = `
            <span class="badge text-bg-light border">
                ${lista.length} resultado(s) encontrados
            </span>
        `;

        return;
    }


    const fases = [
        ...new Set(
            actividadesCache.map(
                actividad =>
                    actividad.fase ||
                    "Sin fase"
            )
        )
    ];


    if (!fases.length) {
        navegacion.innerHTML = "";
        return;
    }


    faseActualIndex =
        Math.min(
            faseActualIndex,
            fases.length - 1
        );


    navegacion.innerHTML =
        fases.map(
            (fase, indice) => `
                <button
                    class="btn btn-sm ${
                        indice === faseActualIndex
                            ? "btn-success"
                            : "btn-outline-success"
                    }"
                    onclick="irAFase(${indice})"
                >
                    ${escHorario(fase)}
                </button>
            `
        ).join("") +

        `
        <span class="fase-info">
            Fase ${faseActualIndex + 1}
            de ${fases.length}
        </span>
        `;
}


function irAFase(indice) {

    faseActualIndex = indice;

    renderPlanActual();
}


/* =====================================================
   ROWSPAN DEL PLAN
===================================================== */

function mismaCelda(a, b, grupo) {

    const idA = a?.[grupo.id];
    const idB = b?.[grupo.id];


    if (
        idA != null &&
        idB != null
    ) {
        return String(idA) === String(idB);
    }


    return normalizarPlan(
        a?.[grupo.campo] || ""
    ) === normalizarPlan(
        b?.[grupo.campo] || ""
    );
}


function esContinuacion(
    lista,
    indice,
    grupo
) {

    return (
        indice > 0 &&
        mismaCelda(
            lista[indice - 1],
            lista[indice],
            grupo
        )
    );
}


function rowspanDesde(
    lista,
    indice,
    grupo
) {

    let cantidad = 1;


    for (
        let i = indice + 1;
        i < lista.length;
        i++
    ) {

        if (
            !mismaCelda(
                lista[indice],
                lista[i],
                grupo
            )
        ) {
            break;
        }


        cantidad++;
    }


    return cantidad;
}


/* =====================================================
   RENDERIZAR PLAN
===================================================== */

function renderPlanActual() {

    const tabla =
        document.getElementById(
            "tablaActividades"
        );


    if (!tabla) return;


    let lista =
        actividadesFiltradas();


    if (!planBusqueda) {

        const fases = [
            ...new Set(
                actividadesCache.map(
                    actividad =>
                        actividad.fase ||
                        "Sin fase"
                )
            )
        ];


        const fase =
            fases[faseActualIndex] ||
            "Sin fase";


        lista = lista.filter(
            actividad =>
                (actividad.fase ||
                    "Sin fase") === fase
        );
    }


    renderNavegacionFases(lista);


    tabla.innerHTML = "";


    if (!lista.length) {

        tabla.innerHTML = `
            <tr>
                <td colspan="10"
                    class="text-center py-4">
                    ${
                        planBusqueda
                            ? "No se encontraron coincidencias en el plan."
                            : "Esta fase no tiene actividades."
                    }
                </td>
            </tr>
        `;

        return;
    }


    const datalist =
        document.getElementById(
            "listaInstructoresPlan"
        );


    if (datalist) {

        datalist.innerHTML =
            instructoresFicha
                .map(
                    instructor => `
                        <option value="${
                            escHorario(
                                instructor.nombre
                            )
                        }">
                        </option>
                    `
                )
                .join("");
    }


    /*
       El Excel utiliza celdas combinadas.
       La tabla web las reproduce mediante rowspan.
    */

    const grupos = [
        {
            campo: "fase",
            id: "id_fase"
        },
        {
            campo: "actividad_proyecto",
            id: "id_actividad_proyecto"
        },
        {
            campo: "competencia",
            id: "id_competencia"
        },
        {
            campo: "resultado",
            id: "id_resultado"
        }
    ];


    lista.forEach(
        (actividad, indice) => {

            const fila =
                document.createElement("tr");


            fila.dataset.planId =
                actividad.id;


            let html = `
                <td>
                    ${indice + 1}
                </td>
            `;


            grupos.forEach(
                grupo => {

                    if (
                        !esContinuacion(
                            lista,
                            indice,
                            grupo
                        )
                    ) {

                        html += `
                            <td
                                rowspan="${
                                    rowspanDesde(
                                        lista,
                                        indice,
                                        grupo
                                    )
                                }"
                                class="plan-grupo-celda"
                            >
                                ${escHorario(
                                    actividad[
                                        grupo.campo
                                    ]
                                )}
                            </td>
                        `;
                    }
                }
            );


            html += `
                <td>
                    ${escHorario(
                        actividad.actividad_aprendizaje
                    )}
                </td>

                <td class="text-center">
                    ${actividad.horas_directas || 0}
                </td>

                <td class="text-center">
                    ${actividad.horas_independientes || 0}
                </td>

                <td>
                    <input
                        list="listaInstructoresPlan"
                        class="form-control form-control-sm plan-instructor-input"
                        value="${escHorario(
                            actividad.instructor || ""
                        )}"
                        placeholder="Escribe para buscar"
                        onchange="asignarInstructorPorNombre(
                            ${actividad.id},
                            this.value
                        )"
                    >
                </td>

                <td>
                    <select
                        class="form-select form-select-sm juicio-evaluacion-select"
                        data-id-plan="${actividad.id}"
                        aria-label="Juicio de evaluación"
                    >
                        ${
                            [
                                "APROBADO",
                                "PENDIENTE",
                                "EN EJECUCIÓN",
                                "SIN CALIFICAR"
                            ]
                            .map(
                                juicio => `
                                    <option
                                        value="${juicio}"
                                        ${
                                            (
                                                actividad.juicio_evaluacion ||
                                                "SIN CALIFICAR"
                                            ) === juicio
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        ${juicio}
                                    </option>
                                `
                            )
                            .join("")
                        }
                    </select>
                </td>
            `;


            fila.innerHTML = html;

            tabla.appendChild(fila);
        }
    );
}


/* =====================================================
   CARGAR PLAN DE FORMACIÓN
===================================================== */

async function cargarActividades() {

    const tabla =
        document.getElementById(
            "tablaActividades"
        );


    try {

        await cargarInstructoresFicha();


        tabla.innerHTML = `
            <tr>
                <td colspan="10"
                    class="text-center">
                    Cargando plan de formación...
                </td>
            </tr>
        `;


        const respuesta =
            await fetch(
                `/actividades/${idFicha}`,
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        const data =
            await respuesta.json();


        if (!respuesta.ok) {

            alert(
                data.mensaje ||
                "No se pudo cargar el plan."
            );

            return;
        }


        actividadesCache =
            data.actividades || [];


        faseActualIndex = 0;


        renderPlanActual();


        actualizarEstadisticas(
            actividadesCache
        );

    } catch (error) {

        console.error(
            "ERROR CARGANDO PLAN:",
            error
        );


        tabla.innerHTML = `
            <tr>
                <td colspan="10"
                    class="text-center text-danger">
                    Error al cargar el plan de formación.
                </td>
            </tr>
        `;
    }
}


/* =====================================================
   ASIGNAR INSTRUCTOR POR NOMBRE
===================================================== */

async function asignarInstructorPorNombre(
    id,
    nombre
) {

    const buscado = normalizarPlan(nombre);

    /* ---------------------------------------------
       Si dejó el campo vacío
       --------------------------------------------- */

    if (!buscado) {

        await asignarInstructor(id, null);

        return;
    }

    /* ---------------------------------------------
       Buscar instructor existente
       --------------------------------------------- */

    const instructor = instructoresFicha.find(
        item =>
            normalizarPlan(item.nombre) === buscado
    );

    /* ---------------------------------------------
       Instructor no encontrado
       --------------------------------------------- */

    if (!instructor) {

        alert(
            "Selecciona un instructor existente de la lista."
        );

        return;
    }

    /* ---------------------------------------------
       Guardar instructor
       --------------------------------------------- */

    await asignarInstructor(
        id,
        instructor.id
    );
}

/* =====================================================
   CAMBIAR JUICIO DE EVALUACIÓN
===================================================== */

async function cambiarJuicioEvaluacion(
    id,
    juicio
) {

    try {

        const respuesta =
            await fetch(
                `/actividades/${id}/juicio-evaluacion`,
                {
                    method: "PUT",
                    headers: {
                        "Authorization":
                            `Bearer ${token}`,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        juicio_evaluacion:
                            juicio
                    })
                }
            );


        const data =
            await respuesta
                .json()
                .catch(() => ({}));


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            alert(
                data.mensaje ||
                "No se pudo actualizar el juicio de evaluación."
            );

            cargarActividades();

            return;
        }


        const actividad =
            actividadesCache.find(
                item =>
                    Number(item.id) ===
                    Number(id)
            );


        if (actividad) {

            actividad.juicio_evaluacion =
                data.juicio_evaluacion ||
                juicio;
        }


        actualizarEstadisticas(
            actividadesCache
        );

    } catch (error) {

        console.error(error);

        alert(
            "No se pudo actualizar el juicio de evaluación."
        );

        cargarActividades();
    }
}


/* =====================================================
   EVENTO JUICIO DE EVALUACIÓN
===================================================== */

document.addEventListener(
    "change",
    event => {

        const select =
            event.target.closest(
                ".juicio-evaluacion-select"
            );


        if (select) {

            cambiarJuicioEvaluacion(
                Number(
                    select.dataset.idPlan
                ),
                select.value
            );
        }
    }
);


/* =====================================================
   12. ESTADÍSTICAS
===================================================== */

function actualizarEstadisticas(
    actividades
) {

    const total =
        actividades.length;


    const conJuicio =
        actividades.filter(
            actividad =>
                actividad.juicio_evaluacion ===
                "APROBADO"
        ).length;


    const sinJuicio =
        total - conJuicio;


    setText(
        "totalActividades",
        total
    );

    setText(
        "actividadesFinalizadas",
        conJuicio
    );

    setText(
        "actividadesProceso",
        0
    );

    setText(
        "actividadesPendientes",
        sinJuicio
    );


    const avance =
        total
            ? Math.round(
                conJuicio /
                total *
                100
            )
            : 0;


    setText(
        "avanceReal",
        avance + "%"
    );


    const barraReal =
        document.getElementById(
            "barraReal"
        );


    if (barraReal) {
        barraReal.style.width =
            avance + "%";
    }


    porcentajeRealGlobal =
        avance;


    actualizarDiferencia();
}


/* =====================================================
   BÚSQUEDA DEL PLAN
===================================================== */

document
    .getElementById("busquedaPlan")
    ?.addEventListener(
        "input",
        event => {

            planBusqueda =
                event.target.value.trim();

            faseActualIndex = 0;

            renderPlanActual();
        }
    );


/* =====================================================
   ASIGNAR INSTRUCTOR
   SIN RECARGAR NI RECONSTRUIR TODA LA TABLA
===================================================== */

async function asignarInstructor(id, idUsuario) {

    try {

        const respuesta = await fetch(
            `/actividades/${id}/instructor`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },

                body: JSON.stringify({
                    id_instructor: idUsuario || null
                })
            }
        );

        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }

        const data = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {

            alert(
                data.mensaje ||
                "No se pudo asignar el instructor."
            );

            return;
        }

        /* ---------------------------------------------
           ACTUALIZAR SOLAMENTE EL REGISTRO MODIFICADO
           --------------------------------------------- */

        const actividad = actividadesCache.find(
            item => Number(item.id) === Number(id)
        );

        if (actividad) {

            actividad.id_instructor =
                data.id_instructor || null;

            const instructor = instructoresFicha.find(
                item =>
                    Number(item.id) === Number(data.id_instructor)
            );

            actividad.instructor =
                instructor
                    ? instructor.nombre
                    : "";

        }

        /* ---------------------------------------------
           NO HACEMOS:
           
           cargarActividades();

           porque eso reconstruía toda la tabla.
           --------------------------------------------- */

        console.log(
            "Instructor actualizado correctamente:",
            data
        );

    } catch (error) {

        console.error(
            "ERROR ASIGNANDO INSTRUCTOR:",
            error
        );

        alert(
            "No se pudo guardar el instructor."
        );
    }
}

/* =====================================================
   14. MODALES
===================================================== */

function crearModalSeguro(elemento) {

    if (!elemento) {

        console.error(
            "No se encontró el elemento del modal."
        );

        return {
            show() {},
            hide() {}
        };
    }


    if (
        window.bootstrap &&
        window.bootstrap.Modal
    ) {

        return window.bootstrap.Modal
            .getOrCreateInstance(elemento);
    }


    return {

        show() {

            elemento.classList.add("show");

            elemento.style.display =
                "block";

            elemento.removeAttribute(
                "aria-hidden"
            );

            document.body.classList.add(
                "modal-open"
            );
        },


        hide() {

            elemento.classList.remove(
                "show"
            );

            elemento.style.display =
                "none";

            elemento.setAttribute(
                "aria-hidden",
                "true"
            );

            document.body.classList.remove(
                "modal-open"
            );
        }
    };
}


/* =====================================================
   15. IMPORTACIÓN DEL PLAN
===================================================== */

const modalImportar =
    crearModalSeguro(
        document.getElementById(
            "modalImportar"
        )
    );


let archivoExcelPrincipal = null;


const columnasPlanPrincipal = [
    [
        "FASE DE PROYECTO",
        "Fase del proyecto: ANÁLISIS, PLANEACIÓN, EJECUCIÓN o EVALUACIÓN."
    ],
    [
        "ACTIVIDAD DE PROYECTO",
        "Actividad de proyecto asociada."
    ],
    [
        "COMPETENCIA",
        "Nombre de la competencia."
    ],
    [
        "RESULTADOS DE APRENDIZAJE",
        "Resultado de aprendizaje."
    ],
    [
        "ACTIVIDADES DE APRENDIZAJE",
        "Actividad de aprendizaje."
    ],
    [
        "HORAS TRABAJO DIRECTO",
        "Horas de trabajo directo."
    ],
    [
        "HORAS TRABAJO INDEPENDIENTE",
        "Horas de trabajo independiente."
    ],
    [
        "INSTRUCTOR",
        "Instructor responsable, opcional."
    ],
    [
        "TRIMESTRE",
        "Trimestre del plan, opcional."
    ],
    [
        "JUICIO DE EVALUACIÓN",
        "APROBADO, PENDIENTE, EN EJECUCIÓN o SIN CALIFICAR."
    ]
];


const columnasHorarioPrincipal = [
    [
        "DÍA",
        "Día de la semana: LUNES a DOMINGO."
    ],
    [
        "HORA INICIO",
        "Hora de inicio en formato HH:MM."
    ],
    [
        "HORA FIN",
        "Hora de finalización en formato HH:MM."
    ],
    [
        "COMPETENCIA",
        "Competencia asociada."
    ],
    [
        "AMBIENTE",
        "Ambiente o aula, opcional."
    ],
    [
        "INSTRUCTOR",
        "Instructor responsable, opcional."
    ]
];


/* =====================================================
   FUNCIONES DE IMPORTACIÓN
===================================================== */

function mostrarColumnasImport(
    id,
    columnas
) {

    const elemento =
        document.getElementById(id);


    if (!elemento) return;


    elemento.innerHTML = `
        <ul class="mb-0 ps-3">
            ${
                columnas.map(
                    columna => `
                        <li>
                            <strong>
                                ${escImport(
                                    columna[0]
                                )}
                            </strong>:
                            ${escImport(
                                columna[1]
                            )}
                        </li>
                    `
                ).join("")
            }
        </ul>
    `;
}


function fichaNumeroImport() {

    const numero =
        document.querySelector(
            "[data-numero-ficha]"
        )?.textContent?.trim() ||
        document.getElementById(
            "numeroFicha"
        )?.textContent?.trim();


    return (
        numero ||
        `Ficha ${idFicha}`
    );
}


async function descargarPlantillaImport(
    url,
    nombre
) {

    try {

        const respuesta =
            await fetch(
                url,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            const data =
                await respuesta
                    .json()
                    .catch(() => ({}));


            throw new Error(
                data.mensaje ||
                "No se pudo descargar la plantilla."
            );
        }


        const blob =
            await respuesta.blob();


        const urlArchivo =
            URL.createObjectURL(blob);


        const enlace =
            document.createElement("a");


        enlace.href =
            urlArchivo;

        enlace.download =
            nombre;


        document.body.appendChild(
            enlace
        );


        enlace.click();

        enlace.remove();


        setTimeout(
            () =>
                URL.revokeObjectURL(
                    urlArchivo
                ),
            1000
        );

    } catch (error) {

        alert(
            error.message ||
            "No se pudo descargar la plantilla."
        );
    }
}


function renderPreviewImport(
    filas,
    boxId,
    countId,
    sumId
) {

    const box =
        document.getElementById(
            boxId
        );


    filas = filas || [];


    setText(
        countId,
        `${filas.length} filas`
    );


    setText(
        sumId,
        filas.length
    );


    if (!box) return;


    if (!filas.length) {

        box.innerHTML = `
            <div class="empty-preview">
                <i class="fa-solid fa-table-list"></i>
                <span>
                    No se encontraron filas para mostrar.
                </span>
            </div>
        `;

        return;
    }


    const columnas = [
        ...new Set(
            filas.flatMap(
                fila =>
                    Object.keys(fila)
            )
        )
    ];


    box.innerHTML = `
        <table
            class="table table-sm table-bordered align-middle mb-0"
        >
            <thead>
                <tr>
                    ${
                        columnas.map(
                            columna =>
                                `<th>${escImport(
                                    columna
                                )}</th>`
                        ).join("")
                    }
                </tr>
            </thead>

            <tbody>
                ${
                    filas
                        .slice(0, 30)
                        .map(
                            fila => `
                                <tr>
                                    ${
                                        columnas.map(
                                            columna =>
                                                `<td>${escImport(
                                                    fila[columna]
                                                )}</td>`
                                        ).join("")
                                    }
                                </tr>
                            `
                        ).join("")
                }
            </tbody>
        </table>

        ${
            filas.length > 30
                ? `
                    <div class="preview-more">
                        Mostrando las primeras 30
                        de ${filas.length} filas.
                    </div>
                `
                : ""
        }
    `;
}


async function prepararPreviewImport(
    inputId,
    boxId,
    countId,
    sumId,
    statusId,
    confirmId
) {

    const input =
        document.getElementById(
            inputId
        );

    const status =
        document.getElementById(
            statusId
        );


    if (!input?.files?.length) {

        alert(
            "Seleccione un archivo Excel."
        );

        return;
    }


    try {

        status.textContent =
            "Leyendo archivo...";


        const workbook =
            XLSX.read(
                await input.files[0]
                    .arrayBuffer(),
                {
                    type: "array"
                }
            );


        const hoja =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];


        const filas =
            XLSX.utils.sheet_to_json(
                hoja,
                {
                    defval: ""
                }
            );


        renderPreviewImport(
            filas,
            boxId,
            countId,
            sumId
        );


        status.textContent =
            filas.length
                ? "Vista previa lista. Revise y confirme la importación."
                : "El archivo no contiene datos.";


        document
            .getElementById(confirmId)
            ?.classList.toggle(
                "d-none",
                !filas.length
            );

    } catch (error) {

        console.error(error);

        status.textContent =
            "No se pudo leer el archivo.";

        alert(
            error.message ||
            "No se pudo leer el Excel."
        );
    }
}


function resetImportPrincipal() {

    const input =
        document.getElementById(
            "archivoExcel"
        );


    if (input) {
        input.value = "";
    }


    document
        .getElementById("btnSubirExcel")
        ?.classList.add("d-none");


    setText(
        "estadoImportacionPrincipal",
        ""
    );


    setText(
        "contadorPreviewExcel",
        "0 filas"
    );


    setText(
        "resumenFilasExcel",
        "0"
    );


    const box =
        document.getElementById(
            "previewExcelPrincipal"
        );


    if (box) {

        box.innerHTML = `
            <div class="empty-preview">
                <i class="fa-solid fa-table-list"></i>
                <span>
                    Seleccione un archivo para
                    ver la vista previa.
                </span>
            </div>
        `;
    }


    setText(
        "importFichaModal",
        fichaNumeroImport()
    );


    mostrarColumnasImport(
        "columnasPlantillaPrincipal",
        columnasPlanPrincipal
    );
}


/* =====================================================
   EVENTOS DE IMPORTACIÓN
===================================================== */

document
    .getElementById("btnImportar")
    ?.addEventListener(
        "click",
        () => {

            resetImportPrincipal();

            modalImportar.show();
        }
    );


document
    .getElementById("btnPlantillaPrincipal")
    ?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            descargarPlantillaImport(
                "/plantillas/plan-formacion",
                "plantilla_plan_formacion.xlsx"
            );
        }
    );


document
    .getElementById(
        "btnMostrarColumnasPrincipal"
    )
    ?.addEventListener(
        "click",
        () =>
            document
                .getElementById(
                    "columnasPlantillaPrincipal"
                )
                ?.classList.toggle(
                    "d-none"
                )
    );


document
    .getElementById(
        "btnVistaPreviaExcel"
    )
    ?.addEventListener(
        "click",
        () =>
            prepararPreviewImport(
                "archivoExcel",
                "previewExcelPrincipal",
                "contadorPreviewExcel",
                "resumenFilasExcel",
                "estadoImportacionPrincipal",
                "btnSubirExcel"
            )
    );


document
    .getElementById("archivoExcel")
    ?.addEventListener(
        "change",
        event => {

            setText(
                "estadoImportacionPrincipal",
                event.target.files?.[0]
                    ? `Archivo seleccionado: ${event.target.files[0].name}`
                    : ""
            );


            document
                .getElementById(
                    "btnSubirExcel"
                )
                ?.classList.add(
                    "d-none"
                );
        }
    );


document
    .getElementById("btnSubirExcel")
    ?.addEventListener(
        "click",
        async () => {

            const archivo =
                document.getElementById(
                    "archivoExcel"
                )?.files?.[0];


            if (!archivo) {

                alert(
                    "Seleccione un archivo Excel."
                );

                return;
            }


            const formulario =
                new FormData();


            formulario.append(
                "archivo",
                archivo
            );


            formulario.append(
                "id_ficha",
                idFicha
            );


            const boton =
                document.getElementById(
                    "btnSubirExcel"
                );


            boton.disabled = true;


            boton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin me-2"></i>
                Importando...
            `;


            try {

                const respuesta =
                    await fetch(
                        "/importar_excel",
                        {
                            method: "POST",
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            },
                            body: formulario
                        }
                    );


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                const data =
                    await respuesta.json();


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "Error al importar Excel."
                    );

                    return;
                }


                alert(
                    data.mensaje ||
                    "Excel importado correctamente."
                );


                modalImportar.hide();


                await actualizarEstadoExcel();


                cargarActividades();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;

                boton.innerHTML = `
                    <i class="fa-solid fa-check me-2"></i>
                    Confirmar importación
                `;
            }
        }
    );


/* =====================================================
   16. IMPORTACIÓN DEL HORARIO
===================================================== */

const modalImportarHorario =
    crearModalSeguro(
        document.getElementById(
            "modalImportarHorario"
        )
    );


function resetImportHorario() {

    const input =
        document.getElementById(
            "archivoHorario"
        );


    if (input) {
        input.value = "";
    }


    document
        .getElementById(
            "btnSubirHorario"
        )
        ?.classList.add(
            "d-none"
        );


    setText(
        "estadoImportacionHorario",
        ""
    );


    setText(
        "contadorPreviewHorario",
        "0 filas"
    );


    setText(
        "resumenFilasHorario",
        "0"
    );


    const box =
        document.getElementById(
            "previewHorarioPrincipal"
        );


    if (box) {

        box.innerHTML = `
            <div class="empty-preview">
                <i class="fa-solid fa-table-list"></i>
                <span>
                    Seleccione un archivo para
                    ver la vista previa.
                </span>
            </div>
        `;
    }


    setText(
        "importFichaHorarioModal",
        fichaNumeroImport()
    );


    mostrarColumnasImport(
        "columnasPlantillaHorario",
        columnasHorarioPrincipal
    );
}


/* =====================================================
   17. AUTOCOMPLETADO
===================================================== */

function configurarAutoPrincipal({
    inputId,
    listId,
    tipo,
    hiddenId = null,
    getExtra = () => ""
}) {

    const input =
        document.getElementById(
            inputId
        );

    const list =
        document.getElementById(
            listId
        );


    if (!input || !list) {
        return;
    }


    let timer;


    const cerrar = () => {
        list.classList.add(
            "d-none"
        );
    };


    const buscar = () => {

        clearTimeout(timer);


        const consulta =
            input.value.trim();


        timer =
            setTimeout(
                async () => {

                    try {

                        const respuesta =
                            await fetch(
                                `/catalogos/busqueda?tipo=${encodeURIComponent(
                                    tipo
                                )}&q=${encodeURIComponent(
                                    consulta
                                )}&id_ficha=${encodeURIComponent(
                                    idFicha
                                )}${getExtra()}`,
                                {
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`
                                    }
                                }
                            );


                        const data =
                            await respuesta.json();


                        if (!respuesta.ok) {

                            cerrar();

                            return;
                        }


                        list.innerHTML =
                            data.length
                                ? data.map(
                                    item => `
                                        <div
                                            class="autocomplete-item"
                                            data-id="${escAutoPrincipal(
                                                item.id
                                            )}"
                                            data-text="${escAutoPrincipal(
                                                item.texto
                                            )}"
                                        >
                                            <strong>
                                                ${escAutoPrincipal(
                                                    item.texto
                                                )}
                                            </strong>

                                            ${
                                                item.correo
                                                    ? `
                                                        <small class="d-block text-muted">
                                                            ${escAutoPrincipal(
                                                                item.correo
                                                            )}
                                                        </small>
                                                    `
                                                    : ""
                                            }

                                            ${
                                                item.categoria
                                                    ? `
                                                        <small class="d-block text-muted">
                                                            ${escAutoPrincipal(
                                                                item.categoria
                                                            )}
                                                        </small>
                                                    `
                                                    : ""
                                            }
                                        </div>
                                    `
                                ).join("")
                                : `
                                    <div class="autocomplete-empty">
                                        No hay coincidencias.
                                    </div>
                                `;


                        list.classList.remove(
                            "d-none"
                        );


                        list
                            .querySelectorAll(
                                ".autocomplete-item"
                            )
                            .forEach(
                                elemento => {

                                    elemento.addEventListener(
                                        "mousedown",
                                        evento => {

                                            evento.preventDefault();


                                            input.value =
                                                elemento.dataset.text;


                                            if (hiddenId) {

                                                const oculto =
                                                    document.getElementById(
                                                        hiddenId
                                                    );

                                                if (oculto) {
                                                    oculto.value =
                                                        elemento.dataset.id;
                                                }
                                            }


                                            cerrar();
                                        }
                                    );
                                }
                            );

                    } catch (error) {

                        console.error(error);
                    }

                },
                180
            );
    };


    input.addEventListener(
        "input",
        () => {

            if (hiddenId) {

                const oculto =
                    document.getElementById(
                        hiddenId
                    );

                if (oculto) {
                    oculto.value = "";
                }
            }


            buscar();
        }
    );


    input.addEventListener(
        "focus",
        buscar
    );


    input.addEventListener(
        "blur",
        () =>
            setTimeout(
                cerrar,
                180
            )
    );
}


/* =====================================================
   18. TRIMESTRE MANUAL
===================================================== */

function actualizarTrimestreManual() {

    fetch(
        `/ficha/${idFicha}`,
        {
            headers: {
                "Authorization":
                    `Bearer ${token}`
            }
        }
    )
        .then(
            respuesta =>
                respuesta.json()
        )
        .then(
            ficha => {

                const campo =
                    document.getElementById(
                        "manualTrimestre"
                    );


                if (campo) {

                    campo.value =
                        ficha.trimestre || 1;
                }
            }
        )
        .catch(
            () => {}
        );
}


/* =====================================================
   19. AGREGAR ACTIVIDAD MANUAL
===================================================== */

const modalAgregarActividad =
    crearModalSeguro(
        document.getElementById(
            "modalAgregarActividad"
        )
    );


document
    .getElementById("btnAgregar")
    ?.addEventListener(
        "click",
        async () => {

            setText(
                "manualInstructor",
                ""
            );


            const campos = [
                "manualInstructorId",
                "manualFaseId",
                "manualActividadProyectoId",
                "manualCompetenciaId",
                "manualResultadoId",
                "manualActividadAprendizajeId"
            ];


            campos.forEach(
                id => {

                    const elemento =
                        document.getElementById(
                            id
                        );

                    if (elemento) {
                        elemento.value = "";
                    }
                }
            );


            actualizarTrimestreManual();


            modalAgregarActividad.show();
        }
    );


document
    .getElementById(
        "btnGuardarActividadManual"
    )
    ?.addEventListener(
        "click",
        async () => {

            const payload = {

                id_ficha:
                    idFicha,

                fase_proyecto:
                    document.getElementById(
                        "manualFase"
                    )?.value || "",

                id_fase:
                    document.getElementById(
                        "manualFaseId"
                    )?.value || null,

                actividad_proyecto:
                    document.getElementById(
                        "manualActividadProyecto"
                    )?.value || "",

                id_actividad_proyecto:
                    document.getElementById(
                        "manualActividadProyectoId"
                    )?.value || null,

                competencia:
                    document.getElementById(
                        "manualCompetencia"
                    )?.value || "",

                resultado_aprendizaje:
                    document.getElementById(
                        "manualResultado"
                    )?.value || "",

                id_resultado:
                    document.getElementById(
                        "manualResultadoId"
                    )?.value || null,

                actividad_aprendizaje:
                    document.getElementById(
                        "manualActividadAprendizaje"
                    )?.value || "",

                id_actividad_aprendizaje:
                    document.getElementById(
                        "manualActividadAprendizajeId"
                    )?.value || null,

                trimestre:
                    document.getElementById(
                        "manualTrimestre"
                    )?.value || 1,

                horas_directas:
                    document.getElementById(
                        "manualHorasDirectas"
                    )?.value || 0,

                horas_independientes:
                    document.getElementById(
                        "manualHorasIndependientes"
                    )?.value || 0,

                id_instructor:
                    document.getElementById(
                        "manualInstructorId"
                    )?.value || null
            };


            if (
                !payload.competencia.trim() ||
                !payload.resultado_aprendizaje.trim()
            ) {

                alert(
                    "Competencia y resultado de aprendizaje son obligatorios."
                );

                return;
            }


            const boton =
                document.getElementById(
                    "btnGuardarActividadManual"
                );


            boton.disabled = true;


            try {

                const respuesta =
                    await fetch(
                        "/actividades/manual",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/json",
                                "Authorization":
                                    `Bearer ${token}`
                            },
                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                const data =
                    await respuesta.json();


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "No se pudo agregar la actividad."
                    );

                    return;
                }


                alert(data.mensaje);


                modalAgregarActividad.hide();


                document
                    .querySelectorAll(
                        "#modalAgregarActividad input, #modalAgregarActividad textarea"
                    )
                    .forEach(
                        elemento =>
                            elemento.value = ""
                    );


                actualizarTrimestreManual();


                setText(
                    "manualHorasDirectas",
                    0
                );


                setText(
                    "manualHorasIndependientes",
                    0
                );


                await cargarActividades();


                await actualizarEstadoExcel();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;
            }
        }
    );


/* =====================================================
   20. ESTADO DEL PLAN
===================================================== */

async function actualizarEstadoExcel() {

    const boton =
        document.getElementById(
            "btnImportar"
        );

    const borrar =
        document.getElementById(
            "btnBorrarExcel"
        );

    const juicios =
        document.getElementById(
            "btnJuiciosEvaluativosPrincipal"
        );

    const buscador =
        document.getElementById(
            "contenedorBusquedaPlan"
        );


    if (!boton) return;


    try {

        const respuesta =
            await fetch(
                `/importar_excel/${idFicha}`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (!respuesta.ok) {
            return;
        }


        const data =
            await respuesta.json();


        const tienePlan =
            !!data.tiene_plan;


        const importado =
            !!data.importado;


        if (buscador) {
            buscador.style.display =
                tienePlan
                    ? "block"
                    : "none";
        }


        if (borrar) {
            borrar.style.display =
                tienePlan
                    ? "inline-block"
                    : "none";
        }


        if (juicios) {
            juicios.style.display =
                tienePlan
                    ? "inline-block"
                    : "none";
        }


        boton.style.display =
            importado
                ? "none"
                : "inline-block";


        boton.disabled = false;

    } catch (error) {

        console.error(error);
    }
}


/* =====================================================
   21. BORRAR PLAN
===================================================== */

document
    .getElementById(
        "btnBorrarExcel"
    )
    ?.addEventListener(
        "click",
        async () => {

            if (
                !confirm(
                    "¿Seguro que deseas borrar el plan de formación? " +
                    "Se eliminarán TODOS los registros de la ficha, " +
                    "incluidos los agregados manualmente."
                )
            ) {
                return;
            }


            try {

                const respuesta =
                    await fetch(
                        `/importar_excel/${idFicha}`,
                        {
                            method: "DELETE",
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            }
                        }
                    );


                const data =
                    await respuesta.json();


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "No se pudo borrar el plan."
                    );

                    return;
                }


                alert(data.mensaje);


                await cargarActividades();


                await actualizarEstadoExcel();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );
            }
        }
    );


/* =====================================================
   22. JUICIOS EVALUATIVOS
===================================================== */

const inputJuiciosPrincipal =
    document.getElementById(
        "archivoJuiciosEvaluativosPrincipal"
    );


document
    .getElementById(
        "btnJuiciosEvaluativosPrincipal"
    )
    ?.addEventListener(
        "click",
        () => {

            if (!idFicha) {

                alert(
                    "No hay una ficha seleccionada."
                );

                return;
            }


            inputJuiciosPrincipal?.click();
        }
    );


inputJuiciosPrincipal
    ?.addEventListener(
        "change",
        async () => {

            const archivo =
                inputJuiciosPrincipal
                    .files?.[0];


            if (!archivo) return;


            const formulario =
                new FormData();


            formulario.append(
                "archivo",
                archivo
            );


            const boton =
                document.getElementById(
                    "btnJuiciosEvaluativosPrincipal"
                );


            boton.disabled = true;


            try {

                const respuesta =
                    await fetch(
                        `/auxiliar/fichas/${idFicha}/juicios-evaluativos`,
                        {
                            method: "POST",
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            },
                            body:
                                formulario
                        }
                    );


                const data =
                    await respuesta
                        .json()
                        .catch(
                            () => ({})
                        );


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "No se pudo procesar el Excel de juicios evaluativos."
                    );

                    return;
                }


                alert(
                    `Juicios procesados. ` +
                    `Coincidencias: ${data.coincidencias || 0}. ` +
                    `Registros actualizados: ${data.actualizados || 0}.`
                );


                await cargarActividades();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;

                inputJuiciosPrincipal.value = "";
            }
        }
    );


/* =====================================================
   23. HORARIO
===================================================== */

const modalHorarioManual =
    crearModalSeguro(
        document.getElementById(
            "modalHorarioManual"
        )
    );


function filaHorarioHtml(
    horario = {},
    indice = 0
) {

    const dias = [
        "LUNES",
        "MARTES",
        "MIÉRCOLES",
        "JUEVES",
        "VIERNES",
        "SÁBADO"
    ];


    return `
        <div
            class="card border mb-2 horario-manual-fila"
            data-index="${indice}"
        >

            <div class="card-body p-3">

                <div
                    class="d-flex justify-content-between align-items-center mb-2"
                >

                    <strong>
                        Día ${indice + 1}
                    </strong>

                    ${
                        indice > 0
                            ? `
                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-danger btn-quitar-fila"
                                >
                                    Quitar
                                </button>
                            `
                            : ""
                    }

                </div>


                <div class="row g-2">

                    <div class="col-md-2">

                        <label class="form-label">
                            Día *
                        </label>

                        <select
                            class="form-select horario-dia"
                        >
                            ${
                                dias.map(
                                    dia => `
                                        <option
                                            value="${dia}"
                                            ${
                                                String(
                                                    horario.dia ||
                                                    "LUNES"
                                                ) === dia
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            ${dia}
                                        </option>
                                    `
                                ).join("")
                            }
                        </select>

                    </div>


                    <div class="col-md-2">

                        <label class="form-label">
                            Inicio *
                        </label>

                        <input
                            class="form-control horario-hora-inicio"
                            type="time"
                            value="${escHorario(
                                horario.hora_inicio ||
                                ""
                            )}"
                        >

                    </div>


                    <div class="col-md-2">

                        <label class="form-label">
                            Fin *
                        </label>

                        <input
                            class="form-control horario-hora-fin"
                            type="time"
                            value="${escHorario(
                                horario.hora_fin ||
                                ""
                            )}"
                        >

                    </div>


                    <div class="col-md-4">

                        <label class="form-label">
                            Competencia *
                        </label>

                        <div class="autocomplete-wrap">

                            <input
                                class="form-control horario-competencia"
                                autocomplete="off"
                                value="${escHorario(
                                    horario.competencia ||
                                    ""
                                )}"
                                placeholder="Haga clic o escriba"
                            >

                            <div
                                class="autocomplete-list d-none horario-comp-list"
                            ></div>

                        </div>

                    </div>


                    <div class="col-md-6">

                        <label class="form-label">
                            Resultado de aprendizaje *
                        </label>

                        <div class="autocomplete-wrap">

                            <textarea
                                class="form-control horario-resultado"
                                rows="2"
                                autocomplete="off"
                                placeholder="Haga clic o escriba el resultado"
                            >${escHorario(
                                horario.resultado ||
                                ""
                            )}</textarea>

                            <div
                                class="autocomplete-list d-none horario-res-list"
                            ></div>

                        </div>

                    </div>


                    <div class="col-md-2">

                        <label class="form-label">
                            Ambiente
                        </label>

                        <input
                            class="form-control horario-ambiente"
                            value="${escHorario(
                                horario.ambiente ||
                                ""
                            )}"
                        >

                    </div>


                    <div class="col-md-6">

                        <label class="form-label">
                            Instructor
                        </label>

                        <div class="autocomplete-wrap">

                            <input
                                class="form-control horario-instructor"
                                autocomplete="off"
                                value="${escHorario(
                                    horario.instructor ||
                                    ""
                                )}"
                                placeholder="Haga clic o escriba"
                            >

                            <div
                                class="autocomplete-list d-none horario-inst-list"
                            ></div>

                        </div>

                    </div>

                </div>

            </div>

        </div>
    `;
}


/* =====================================================
   AUTOCOMPLETADO DEL HORARIO
===================================================== */

function prepararAutocompletadoFila(
    fila
) {

    const competencia =
        fila.querySelector(
            ".horario-competencia"
        );

    const competenciaLista =
        fila.querySelector(
            ".horario-comp-list"
        );


    const instructor =
        fila.querySelector(
            ".horario-instructor"
        );

    const instructorLista =
        fila.querySelector(
            ".horario-inst-list"
        );


    const configurar =
        (
            input,
            lista,
            tipo
        ) => {

            if (
                !input ||
                !lista ||
                input.dataset.ready
            ) {
                return;
            }


            input.dataset.ready = "1";


            let timer;


            const cerrar = () =>
                lista.classList.add(
                    "d-none"
                );


            const buscar = () => {

                clearTimeout(timer);


                const consulta =
                    input.value.trim();


                timer =
                    setTimeout(
                        async () => {

                            try {

                                const respuesta =
                                    await fetch(
                                        `/catalogos/busqueda?tipo=${tipo}&q=${encodeURIComponent(
                                            consulta
                                        )}&id_ficha=${encodeURIComponent(
                                            idFicha
                                        )}`,
                                        {
                                            headers: {
                                                Authorization:
                                                    `Bearer ${token}`
                                            }
                                        }
                                    );


                                const data =
                                    await respuesta.json();


                                if (!respuesta.ok) {

                                    cerrar();

                                    return;
                                }


                                lista.innerHTML =
                                    data.length
                                        ? data.map(
                                            item => `
                                                <div
                                                    class="autocomplete-item"
                                                    data-text="${escHorario(
                                                        item.texto
                                                    )}"
                                                >
                                                    <strong>
                                                        ${escHorario(
                                                            item.texto
                                                        )}
                                                    </strong>
                                                </div>
                                            `
                                        ).join("")
                                        : `
                                            <div class="autocomplete-empty">
                                                No hay coincidencias.
                                            </div>
                                        `;


                                lista.classList.remove(
                                    "d-none"
                                );


                                lista
                                    .querySelectorAll(
                                        ".autocomplete-item"
                                    )
                                    .forEach(
                                        elemento =>
                                            elemento.addEventListener(
                                                "mousedown",
                                                evento => {

                                                    evento.preventDefault();


                                                    input.value =
                                                        elemento.dataset.text;


                                                    cerrar();
                                                }
                                            )
                                    );

                            } catch (error) {

                                console.error(error);
                            }

                        },
                        150
                    );
            };


            input.addEventListener(
                "input",
                buscar
            );


            input.addEventListener(
                "focus",
                buscar
            );


            input.addEventListener(
                "blur",
                () =>
                    setTimeout(
                        cerrar,
                        180
                    )
            );
        };


    configurar(
        competencia,
        competenciaLista,
        "competencias"
    );


    configurar(
        instructor,
        instructorLista,
        "instructores"
    );
}


/* =====================================================
   BOTONES DEL HORARIO
===================================================== */

function actualizarBotonesHorario(
    tieneHorario
) {

    const importar =
        document.getElementById(
            "btnImportarHorario"
        );

    const exportar =
        document.getElementById(
            "btnExportarHorario"
        );

    const borrar =
        document.getElementById(
            "btnEliminarTodosHorario"
        );

    const agregar =
        document.getElementById(
            "btnAgregarHorario"
        );


    if (importar) {
        importar.style.display =
            tieneHorario
                ? "none"
                : "inline-block";
    }


    if (exportar) {
        exportar.style.display =
            tieneHorario
                ? "inline-block"
                : "none";
    }


    if (borrar) {
        borrar.style.display =
            tieneHorario
                ? "inline-block"
                : "none";
    }


    if (agregar) {

        agregar.style.display =
            "inline-block";


        agregar.innerHTML =
            tieneHorario
                ? `
                    <i class="fa-solid fa-plus"></i>
                    Agregar horario por día
                `
                : `
                    <i class="fa-solid fa-calendar-week"></i>
                    Agregar horario semanal
                `;
    }
}


/* =====================================================
   ABRIR MODAL DE HORARIO
===================================================== */

async function abrirModalHorario(
    horario = null
) {

    const respuesta =
        await fetch(
            `/horarios/${idFicha}`,
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


    const estado =
        await respuesta
            .json()
            .catch(
                () => ({
                    horarios: []
                })
            );


    const tiene =
        Array.isArray(
            estado.horarios
        ) &&
        estado.horarios.length > 0;


    setText(
        "horarioEditId",
        horario
            ? horario.id
            : ""
    );


    const editId =
        document.getElementById(
            "horarioEditId"
        );

    if (editId) {
        editId.value =
            horario
                ? horario.id
                : "";
    }


    const trimestre =
        document.getElementById(
            "horarioTrimestre"
        );

    if (trimestre) {
        trimestre.value =
            estado.trimestre_actual ||
            1;
    }


    const anio =
        document.getElementById(
            "horarioAnio"
        );

    if (anio) {
        anio.value =
            estado.anio_actual ||
            new Date().getFullYear();
    }


    setText(
        "tituloModalHorario",
        horario
            ? "Editar horario"
            : (
                tiene
                    ? "Agregar horario por día"
                    : "Agregar horario semanal"
            )
    );


    setText(
        "horarioModoAviso",
        tiene
            ? "La ficha ya tiene horario. Puedes agregar registros manuales por día sin borrar el horario importado."
            : "No hay horario. Puedes registrar toda la semana y agregar los días que necesites."
    );


    const contenedor =
        document.getElementById(
            "contenedorHorariosManuales"
        );


    if (!contenedor) return;


    contenedor.innerHTML = "";


    contenedor.insertAdjacentHTML(
        "beforeend",
        filaHorarioHtml(
            horario || {},
            0
        )
    );


    const fila =
        contenedor.firstElementChild;


    prepararAutocompletadoFila(
        fila
    );


    fila
        .querySelector(
            ".btn-quitar-fila"
        )
        ?.addEventListener(
            "click",
            () => fila.remove()
        );


    const botonAgregar =
        document.getElementById(
            "btnAgregarFilaHorario"
        );


    if (botonAgregar) {

        botonAgregar.style.display =
            tiene || horario
                ? "none"
                : "inline-block";
    }


    modalHorarioManual.show();
}


/* =====================================================
   AGREGAR FILA DE HORARIO
===================================================== */

document
    .getElementById(
        "btnAgregarFilaHorario"
    )
    ?.addEventListener(
        "click",
        () => {

            const contenedor =
                document.getElementById(
                    "contenedorHorariosManuales"
                );


            const indice =
                contenedor.querySelectorAll(
                    ".horario-manual-fila"
                ).length;


            contenedor.insertAdjacentHTML(
                "beforeend",
                filaHorarioHtml(
                    {},
                    indice
                )
            );


            const fila =
                contenedor.lastElementChild;


            prepararAutocompletadoFila(
                fila
            );


            fila
                .querySelector(
                    ".btn-quitar-fila"
                )
                ?.addEventListener(
                    "click",
                    () => fila.remove()
                );
        }
    );


/* =====================================================
   CARGAR HORARIO
===================================================== */

async function cargarHorario() {

    const tabla =
        document.getElementById(
            "tablaHorario"
        );


    try {

        const estado =
            await fetch(
                `/horarios/${idFicha}/estado-trimestre`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        const estadoData =
            await estado.json()
                .catch(
                    () => ({})
                );


        const badge =
            document.getElementById(
                "trimestreActualHorario"
            );


        if (
            badge &&
            estadoData.trimestre_actual
        ) {

            badge.textContent =
                `T${estadoData.trimestre_actual} — ${estadoData.anio_actual}`;
        }


        const alerta =
            document.getElementById(
                "alertaTrimestreHorario"
            );


        if (alerta) {

            alerta.classList.toggle(
                "d-none",
                !estadoData.cambio_requerido
            );
        }


        const respuesta =
            await fetch(
                `/horarios/${idFicha}`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        const data =
            await respuesta.json();


        if (!respuesta.ok) {

            tabla.innerHTML = `
                <tr>
                    <td colspan="9"
                        class="text-center">
                        ${escHorario(
                            data.mensaje ||
                            "No se pudo cargar el horario."
                        )}
                    </td>
                </tr>
            `;


            actualizarBotonesHorario(
                false
            );


            return;
        }


        const horarios =
            data.horarios || [];


        actualizarBotonesHorario(
            horarios.length > 0
        );


        const trimestre =
            document.getElementById(
                "horarioTrimestre"
            );


        if (trimestre) {
            trimestre.value =
                data.trimestre_actual ||
                1;
        }


        const anio =
            document.getElementById(
                "horarioAnio"
            );


        if (anio) {
            anio.value =
                data.anio_actual ||
                new Date().getFullYear();
        }


        tabla.innerHTML = "";


        if (!horarios.length) {

            tabla.innerHTML = `
                <tr>
                    <td colspan="9"
                        class="text-center py-4">
                        No hay horario cargado para el
                        trimestre T${escHorario(
                            data.trimestre_actual ||
                            1
                        )}
                        —
                        ${escHorario(
                            data.anio_actual ||
                            ""
                        )}.
                    </td>
                </tr>
            `;
        }


        horarios.forEach(
            horario => {

                const fila =
                    document.createElement(
                        "tr"
                    );


                fila.innerHTML = `
                    <td>
                        ${escHorario(
                            horario.dia
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.hora_inicio
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.hora_fin
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.competencia
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.resultado ||
                            ""
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.ambiente
                        )}
                    </td>

                    <td>
                        ${escHorario(
                            horario.instructor ||
                            "Sin asignar"
                        )}
                    </td>

                    <td class="text-center">
                        <span class="badge text-bg-success">
                            T${escHorario(
                                horario.trimestre ||
                                1
                            )}
                        </span>
                    </td>

                    <td class="text-center text-nowrap">

                        <button
                            class="btn btn-sm btn-outline-primary me-1 btn-editar-horario"
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button
                            class="btn btn-sm btn-outline-danger btn-eliminar-horario"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>

                    </td>
                `;


                fila
                    .querySelector(
                        ".btn-editar-horario"
                    )
                    .addEventListener(
                        "click",
                        () =>
                            abrirModalHorario(
                                horario
                            )
                    );


                fila
                    .querySelector(
                        ".btn-eliminar-horario"
                    )
                    .addEventListener(
                        "click",
                        () =>
                            eliminarHorario(
                                horario.id
                            )
                    );


                tabla.appendChild(
                    fila
                );
            }
        );

    } catch (error) {

        console.error(
            "ERROR CARGANDO HORARIO:",
            error
        );


        actualizarBotonesHorario(
            false
        );


        tabla.innerHTML = `
            <tr>
                <td colspan="9"
                    class="text-center text-danger">
                    Error al conectar con el servidor.
                </td>
            </tr>
        `;
    }
}


/* =====================================================
   24. HISTORIAL DE HORARIOS
===================================================== */

async function descargarHistorialHorario(
    idHistorial
) {

    try {

        const respuesta =
            await fetch(
                `/horarios/historial/${idHistorial}/descargar`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            const data =
                await respuesta
                    .json()
                    .catch(
                        () => ({})
                    );


            alert(
                data.mensaje ||
                "No se pudo descargar el horario histórico."
            );

            return;
        }


        const blob =
            await respuesta.blob();


        const url =
            URL.createObjectURL(blob);


        const enlace =
            document.createElement("a");


        enlace.href = url;


        enlace.download =
            `horario_historico_${idHistorial}.xlsx`;


        document.body.appendChild(
            enlace
        );


        enlace.click();

        enlace.remove();


        URL.revokeObjectURL(
            url
        );

    } catch (error) {

        console.error(error);

        alert(
            "Error al descargar el horario histórico."
        );
    }
}


async function cargarHistorialHorarios(
    abrir = false
) {

    const contenedor =
        document.getElementById(
            "listaHistorialHorario"
        );


    if (contenedor) {

        contenedor.innerHTML = `
            <div class="text-center text-muted py-3">
                Cargando historial...
            </div>
        `;
    }


    try {

        const respuesta =
            await fetch(
                `/horarios/${idFicha}/historial`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        const data =
            await respuesta
                .json()
                .catch(
                    () => []
                );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            if (contenedor) {

                contenedor.innerHTML = `
                    <div class="alert alert-warning mb-0">
                        ${escHorario(
                            data.mensaje ||
                            "No se pudo cargar el historial."
                        )}
                    </div>
                `;
            }

            return;
        }


        if (
            !Array.isArray(data) ||
            !data.length
        ) {

            if (contenedor) {

                contenedor.innerHTML = `
                    <div class="text-center text-muted py-4">

                        <i
                            class="fa-solid fa-clock-rotate-left fa-2x mb-2"
                        ></i>

                        <div>
                            Aún no hay horarios guardados
                            en el historial.
                        </div>

                    </div>
                `;
            }

        } else if (contenedor) {

            contenedor.innerHTML =
                data.map(
                    item => `
                        <div
                            class="border rounded p-3 mb-2 d-flex justify-content-between align-items-center gap-3"
                        >

                            <div>

                                <strong>
                                    Trimestre T${escHorario(
                                        item.trimestre
                                    )}
                                    —
                                    ${escHorario(
                                        item.anio
                                    )}
                                </strong>

                                <div class="small text-muted">
                                    Guardado:
                                    ${escHorario(
                                        item.fecha
                                    )}
                                </div>

                                <div class="small">
                                    ${escHorario(
                                        item.nombre_archivo
                                    )}
                                </div>

                            </div>


                            <button
                                type="button"
                                class="btn btn-sm btn-outline-primary btn-descargar-historial"
                                data-historial-id="${Number(
                                    item.id
                                ) || 0}"
                            >
                                <i
                                    class="fa-solid fa-download me-1"
                                ></i>
                                Descargar
                            </button>

                        </div>
                    `
                ).join("");
        }


        contenedor
            ?.querySelectorAll(
                ".btn-descargar-historial"
            )
            .forEach(
                boton =>
                    boton.addEventListener(
                        "click",
                        () =>
                            descargarHistorialHorario(
                                Number(
                                    boton.dataset
                                        .historialId
                                )
                            )
                    )
            );


        if (abrir) {
            modalHistorialHorario.show();
        }

    } catch (error) {

        console.error(error);

        if (contenedor) {

            contenedor.innerHTML = `
                <div class="alert alert-danger mb-0">
                    Error al conectar con el servidor.
                </div>
            `;
        }
    }
}


const modalHistorialHorario =
    crearModalSeguro(
        document.getElementById(
            "modalHistorialHorario"
        )
    );


document
    .getElementById(
        "btnHistorialHorario"
    )
    ?.addEventListener(
        "click",
        () =>
            cargarHistorialHorarios(
                true
            )
    );


/* =====================================================
   25. ELIMINAR HORARIO
===================================================== */

async function eliminarHorario(
    idHorario
) {

    if (
        !confirm(
            "¿Seguro que deseas eliminar este horario?"
        )
    ) {
        return;
    }


    try {

        const respuesta =
            await fetch(
                `/horarios/${idHorario}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );


        const data =
            await respuesta
                .json()
                .catch(
                    () => ({})
                );


        if (respuesta.status === 401) {
            sesionExpirada();
            return;
        }


        if (!respuesta.ok) {

            alert(
                data.mensaje ||
                "No se pudo eliminar el horario."
            );

            return;
        }


        alert(
            data.mensaje ||
            "Horario eliminado correctamente."
        );


        await cargarHorario();

        await cargarActividades();

    } catch (error) {

        console.error(error);

        alert(
            "Error al conectar con el servidor."
        );
    }
}


/* =====================================================
   26. ELIMINAR TODO EL HORARIO
===================================================== */

document
    .getElementById(
        "btnEliminarTodosHorario"
    )
    ?.addEventListener(
        "click",
        async () => {

            if (
                !confirm(
                    "Esto eliminará TODO el horario de esta ficha. " +
                    "El Plan de Formación y los instructores NO se eliminarán. " +
                    "¿Continuar?"
                )
            ) {
                return;
            }


            const guardar =
                confirm(
                    "¿Deseas guardar una copia de este horario " +
                    "en el botón Historial antes de eliminarlo?\n\n" +
                    "Aceptar = Sí, guardar historial\n" +
                    "Cancelar = No, eliminar sin guardar"
                );


            try {

                const respuesta =
                    await fetch(
                        `/horarios/${idFicha}/todos`,
                        {
                            method: "DELETE",
                            headers: {
                                Authorization:
                                    `Bearer ${token}`,
                                "Content-Type":
                                    "application/json"
                            },
                            body:
                                JSON.stringify({
                                    guardar_historial:
                                        guardar
                                })
                        }
                    );


                const data =
                    await respuesta
                        .json()
                        .catch(
                            () => ({})
                        );


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "No se pudo eliminar el horario."
                    );

                    return;
                }


                alert(
                    data.mensaje ||
                    "Horario eliminado."
                );


                await cargarHorario();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );
            }
        }
    );


/* =====================================================
   27. IMPORTAR HORARIO
===================================================== */

document
    .getElementById(
        "btnImportarHorario"
    )
    ?.addEventListener(
        "click",
        async () => {

            try {

                const respuesta =
                    await fetch(
                        `/horarios/${idFicha}`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            }
                        }
                    );


                const data =
                    await respuesta.json();


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    alert(
                        data.mensaje ||
                        "No se pudo comprobar el horario."
                    );

                    return;
                }


                if (
                    (data.horarios || [])
                        .length > 0
                ) {

                    alert(
                        "Esta ficha ya tiene un horario cargado. " +
                        "Debes eliminar primero el horario actual " +
                        "y después cargar el nuevo."
                    );

                    return;
                }


                const archivo =
                    document.getElementById(
                        "archivoHorario"
                    );


                if (archivo) {
                    archivo.value = "";
                }


                modalImportarHorario.show();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );
            }
        }
    );


/* =====================================================
   28. SUBIR HORARIO
===================================================== */

document
    .getElementById(
        "btnSubirHorario"
    )
    ?.addEventListener(
        "click",
        async () => {

            const archivo =
                document.getElementById(
                    "archivoHorario"
                )?.files?.[0];


            if (!archivo) {

                alert(
                    "Seleccione un Excel de horario."
                );

                return;
            }


            const formulario =
                new FormData();


            formulario.append(
                "archivo",
                archivo
            );


            formulario.append(
                "id_ficha",
                idFicha
            );


            const boton =
                document.getElementById(
                    "btnSubirHorario"
                );


            boton.disabled = true;


            boton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Importando...
            `;


            try {

                const respuesta =
                    await fetch(
                        "/importar_horario",
                        {
                            method: "POST",
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            },
                            body:
                                formulario
                        }
                    );


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                const resultado =
                    await respuesta.json();


                if (!respuesta.ok) {

                    alert(
                        resultado.mensaje ||
                        "Error al importar el horario."
                    );

                    return;
                }


                let mensaje =
                    `${resultado.mensaje}\n\n` +
                    `Horarios cargados: ${
                        resultado.horarios_cargados ||
                        0
                    }`;


                if (
                    resultado.actividades_actualizadas !==
                    undefined
                ) {

                    mensaje +=
                        `\nActividades del plan actualizadas: ${
                            resultado.actividades_actualizadas ||
                            0
                        }`;
                }


                if (
                    resultado.instructores_creados
                        ?.length
                ) {

                    mensaje +=
                        `\n\nInstructores creados automáticamente:\n- ${
                            resultado
                                .instructores_creados
                                .map(
                                    instructor =>
                                        instructor.nombre
                                )
                                .join("\n- ")
                        }`;
                }


                alert(mensaje);


                modalImportarHorario.hide();


                await cargarHorario();

                await cargarActividades();

            } catch (error) {

                console.error(
                    "ERROR IMPORTANDO HORARIO:",
                    error
                );

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;

                boton.innerHTML = `
                    <i class="fa-solid fa-upload"></i>
                    Importar horario
                `;
            }
        }
    );


/* =====================================================
   29. EXPORTAR HORARIO
===================================================== */

document
    .getElementById(
        "btnExportarHorario"
    )
    ?.addEventListener(
        "click",
        async () => {

            const boton =
                document.getElementById(
                    "btnExportarHorario"
                );


            boton.disabled = true;


            try {

                const respuesta =
                    await fetch(
                        `/horarios/${idFicha}/exportar`,
                        {
                            headers: {
                                Authorization:
                                    `Bearer ${token}`
                            }
                        }
                    );


                if (respuesta.status === 401) {
                    sesionExpirada();
                    return;
                }


                if (!respuesta.ok) {

                    const data =
                        await respuesta
                            .json()
                            .catch(
                                () => ({})
                            );


                    alert(
                        data.mensaje ||
                        "No se pudo exportar el horario."
                    );

                    return;
                }


                const blob =
                    await respuesta.blob();


                const url =
                    URL.createObjectURL(blob);


                const enlace =
                    document.createElement("a");


                enlace.href = url;


                enlace.download =
                    `horario_ficha_${idFicha}.xlsx`;


                document.body.appendChild(
                    enlace
                );


                enlace.click();

                enlace.remove();


                URL.revokeObjectURL(url);

            } catch (error) {

                console.error(
                    "ERROR EXPORTANDO HORARIO:",
                    error
                );

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;
            }
        }
    );


/* =====================================================
   30. AGREGAR HORARIO MANUAL
===================================================== */

document
    .getElementById(
        "btnAgregarHorario"
    )
    ?.addEventListener(
        "click",
        () =>
            abrirModalHorario()
    );


document
    .getElementById(
        "btnGuardarHorarioManual"
    )
    ?.addEventListener(
        "click",
        async () => {

            const editId =
                document.getElementById(
                    "horarioEditId"
                )?.value;


            const filas = [
                ...document.querySelectorAll(
                    "#contenedorHorariosManuales .horario-manual-fila"
                )
            ];


            if (!filas.length) {

                alert(
                    "Agrega al menos un día."
                );

                return;
            }


            const datos =
                filas.map(
                    fila => ({
                        dia:
                            fila.querySelector(
                                ".horario-dia"
                            ).value,

                        hora_inicio:
                            fila.querySelector(
                                ".horario-hora-inicio"
                            ).value,

                        hora_fin:
                            fila.querySelector(
                                ".horario-hora-fin"
                            ).value,

                        competencia:
                            fila.querySelector(
                                ".horario-competencia"
                            ).value.trim(),

                        resultado_aprendizaje:
                            fila.querySelector(
                                ".horario-resultado"
                            )?.value.trim() ||
                            "",

                        ambiente:
                            fila.querySelector(
                                ".horario-ambiente"
                            ).value.trim(),

                        instructor:
                            fila.querySelector(
                                ".horario-instructor"
                            ).value.trim()
                    })
                );


            for (const dato of datos) {

                if (
                    !dato.hora_inicio ||
                    !dato.hora_fin ||
                    !dato.competencia ||
                    !dato.resultado_aprendizaje
                ) {

                    alert(
                        "Cada registro debe tener día, horas, competencia y resultado de aprendizaje."
                    );

                    return;
                }
            }


            const boton =
                document.getElementById(
                    "btnGuardarHorarioManual"
                );


            boton.disabled = true;


            try {

                if (editId) {

                    const respuesta =
                        await fetch(
                            `/horarios/${editId}`,
                            {
                                method: "PUT",
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`,
                                    "Content-Type":
                                        "application/json"
                                },
                                body:
                                    JSON.stringify(
                                        datos[0]
                                    )
                            }
                        );


                    const data =
                        await respuesta
                            .json()
                            .catch(
                                () => ({})
                            );


                    if (!respuesta.ok) {

                        alert(
                            data.mensaje ||
                            "No se pudo editar el horario."
                        );

                        return;
                    }

                } else {

                    for (
                        const dato
                        of datos
                    ) {

                        const respuesta =
                            await fetch(
                                `/horarios/${idFicha}`,
                                {
                                    method: "POST",
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`,
                                        "Content-Type":
                                            "application/json"
                                    },
                                    body:
                                        JSON.stringify(
                                            dato
                                        )
                                }
                            );


                        const data =
                            await respuesta
                                .json()
                                .catch(
                                    () => ({})
                                );


                        if (!respuesta.ok) {

                            alert(
                                data.mensaje ||
                                "No se pudo guardar el horario."
                            );

                            return;
                        }
                    }
                }


                alert(
                    "Horario guardado correctamente."
                );


                modalHorarioManual.hide();


                await cargarHorario();

                await cargarActividades();

            } catch (error) {

                console.error(error);

                alert(
                    "Error al conectar con el servidor."
                );

            } finally {

                boton.disabled = false;
            }
        }
    );


/* =====================================================
   31. BOTÓN VOLVER
===================================================== */

document
    .getElementById("btnVolver")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                "/panel_instructor";
        }
    );


/* =====================================================
   32. CERRAR SESIÓN
===================================================== */

document
    .getElementById("btnSalir")
    ?.addEventListener(
        "click",
        () => {

            localStorage.removeItem("token");
            localStorage.removeItem("id_usuario");
            localStorage.removeItem("nombre");
            localStorage.removeItem("rol");
            localStorage.removeItem("id_ficha");

            window.location.href = "/";
        }
    );


/* =====================================================
   33. AUTOCOMPLETADOS DEL FORMULARIO MANUAL
===================================================== */

configurarAutoPrincipal({
    inputId: "manualFase",
    listId: "manualFaseSuggestions",
    tipo: "fases",
    hiddenId: "manualFaseId"
});


configurarAutoPrincipal({
    inputId: "manualActividadProyecto",
    listId: "manualActividadProyectoSuggestions",
    tipo: "actividades_proyecto",
    hiddenId: "manualActividadProyectoId"
});


configurarAutoPrincipal({
    inputId: "manualCompetencia",
    listId: "manualCompetenciaSuggestions",
    tipo: "competencias",
    hiddenId: "manualCompetenciaId"
});


configurarAutoPrincipal({
    inputId: "manualResultado",
    listId: "manualResultadoSuggestions",
    tipo: "resultados",
    hiddenId: "manualResultadoId",

    getExtra: () => {

        const id =
            document.getElementById(
                "manualCompetenciaId"
            )?.value;


        return id
            ? `&id_competencia=${id}`
            : "";
    }
});


configurarAutoPrincipal({
    inputId: "manualActividadAprendizaje",
    listId: "manualActividadSuggestions",
    tipo: "actividades",
    hiddenId: "manualActividadAprendizajeId"
});


configurarAutoPrincipal({
    inputId: "manualInstructor",
    listId: "manualInstructorSuggestions",
    tipo: "instructores",
    hiddenId: "manualInstructorId"
});


/*
   Estos dos pueden quedarse solamente si
   esos elementos existen en el HTML.
*/

configurarAutoPrincipal({
    inputId: "horarioCompetencia",
    listId: "horarioCompetenciaSuggestions",
    tipo: "competencias"
});


configurarAutoPrincipal({
    inputId: "horarioInstructor",
    listId: "horarioInstructorSuggestions",
    tipo: "instructores"
});


/* =====================================================
   34. EDITAR ACTIVIDAD
===================================================== */

function editarActividad(id) {

    alert(
        "Editar actividad ID: " + id
    );
}



/* =====================================================
   35. INICIAR PÁGINA
===================================================== */

cargarFicha();

cargarActividades();

cargarHorario();

actualizarEstadoExcel();