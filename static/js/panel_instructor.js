// =========================================================
// PANEL INSTRUCTOR
// =========================================================


// =========================================================
// SESIÓN
// =========================================================

const token = localStorage.getItem("token");
const nombre = localStorage.getItem("nombre");

if (!token) {
    window.location.href = "/";
}


// =========================================================
// ELEMENTOS PRINCIPALES
// =========================================================

const nombreInstructor =
    document.getElementById("nombreInstructor");

const perfilNombre =
    document.getElementById("perfilNombre");

const listaResumenFichas =
    document.getElementById("listaResumenFichas");

const totalFichas =
    document.getElementById("totalFichas");

const buscarFichas =
    document.getElementById("buscarFichas");

const sinResultadosFichas =
    document.getElementById("sinResultadosFichas");

const notasFichaPanel =
    document.getElementById("notasFichaPanel");

const notasTextoPanel =
    document.getElementById("notasTextoPanel");

const estadoNotasPanel =
    document.getElementById("estadoNotasPanel");

const btnGuardarNotasPanel =
    document.getElementById("btnGuardarNotasPanel");

const btnCerrarSesion =
    document.getElementById("btnCerrarSesion");


// =========================================================
// ELEMENTOS DE PERFIL
// =========================================================

const fotoPerfil =
    document.getElementById("fotoPerfil");

const perfilAvatar =
    document.getElementById("perfilAvatar");

const fotoPerfilPreview =
    document.getElementById("fotoPerfilPreview");

const btnAceptarFoto =
    document.getElementById("btnAceptarFoto");

const btnCancelarFoto =
    document.getElementById("btnCancelarFoto");

const btnQuitarFoto =
    document.getElementById("btnQuitarFoto");


// =========================================================
// VARIABLES
// =========================================================

let fichasDisponibles = [];

let fotoPerfilPendiente = null;


// =========================================================
// DATOS DEL INSTRUCTOR
// =========================================================

if (nombreInstructor) {

    nombreInstructor.textContent =
        nombre || "Instructor";

}


if (perfilNombre) {

    perfilNombre.textContent =
        nombre || "Instructor";

}


// =========================================================
// FUNCIONES AUXILIARES
// =========================================================

function numeroFicha(ficha) {

    return (
        ficha.numero_ficha ??
        ficha.numero ??
        "Sin número"
    );

}


function nombrePrograma(ficha) {

    return (
        ficha.programa ??
        ficha.nombre_programa ??
        ""
    );

}


function escaparHTML(texto) {

    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =========================================================
// CARGAR FICHAS
// =========================================================

async function cargarFichas() {

    try {

        const respuesta =
            await fetch("/fichas", {

                method: "GET",

                headers: {
                    "Authorization":
                        "Bearer " + token
                }

            });


        // -----------------------------------------
        // SESIÓN EXPIRADA
        // -----------------------------------------

        if (respuesta.status === 401) {

            localStorage.clear();

            window.location.href = "/";

            return;

        }


        if (!respuesta.ok) {

            throw new Error(
                "No se pudieron cargar las fichas."
            );

        }


        fichasDisponibles =
            await respuesta.json();


        // -----------------------------------------
        // TOTAL DE FICHAS
        // -----------------------------------------

        if (totalFichas) {

            totalFichas.textContent =
                fichasDisponibles.length;

        }


        // -----------------------------------------
        // MOSTRAR FICHAS
        // -----------------------------------------

        mostrarFichas(
            fichasDisponibles
        );
        actualizarDashboardInstructor(fichasDisponibles);


        // -----------------------------------------
        // CARGAR SELECTOR DE NOVEDADES
        // -----------------------------------------

        cargarSelectorNotas();


        // -----------------------------------------
        // RECUPERAR FICHA ACTUAL
        // -----------------------------------------

        const fichaActual =
            localStorage.getItem("id_ficha");


        if (
            fichaActual &&
            fichasDisponibles.some(
                ficha =>
                    String(ficha.id) ===
                    String(fichaActual)
            )
        ) {

            if (notasFichaPanel) {

                notasFichaPanel.value =
                    fichaActual;

            }


            cargarNotasFicha(
                fichaActual
            );

        }

    } catch (error) {

        console.error(
            "Error cargando fichas:",
            error
        );


        if (listaResumenFichas) {

            listaResumenFichas.innerHTML = `

                <li class="sin-fichas">

                    No se pudieron cargar
                    las fichas.

                </li>

            `;

        }

    }

}


function actualizarDashboardInstructor(fichas) {
    const total=fichas.length;
    const activas=fichas.filter(f=>String(f.estado||"").toLowerCase()==="activa").length;
    const terminadas=fichas.filter(f=>String(f.estado||"").toLowerCase()==="terminada").length;
    const avances=fichas.map(f=>Number(f.avance ?? f.porcentaje_avance ?? 0)).filter(n=>Number.isFinite(n));
    const promedio=avances.length?Math.round(avances.reduce((a,b)=>a+b,0)/avances.length):0;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    set("grafTotalFichas",total);set("grafFichasActivas",activas);set("grafFichasTerminadas",terminadas);set("grafAvanceMedio",promedio+"%");set("donutTotalInstructor",total);set("leyActivas",activas);set("leyTerminadas",terminadas);
    const donut=document.getElementById("donutInstructor");
    if(donut){const a=total?activas/total*360:0;donut.style.background=`conic-gradient(var(--sena) 0deg ${a}deg,#1266d6 ${a}deg ${a+(total?terminadas/total*360:0)}deg,#edf0f3 ${a+(total?terminadas/total*360:0)}deg 360deg)`;}
    const cont=document.getElementById("barrasAvanceInstructor");
    if(!cont)return;
    const filas=[...fichas].map(f=>({n:String(numeroFicha(f)),v:Math.max(0,Math.min(100,Number(f.avance ?? f.porcentaje_avance ?? 0)||0))})).sort((a,b)=>b.v-a.v);
    cont.innerHTML=filas.length?filas.map(x=>`<div class="barra-ficha-inst"><span>${escaparHTML(x.n)}</span><div class="track"><span style="width:${x.v}%"></span></div><b>${x.v}%</b></div>`).join(""): '<div class="grafico-vacio">No tienes fichas asignadas.</div>';
}

// =========================================================
// MOSTRAR FICHAS
// =========================================================

function mostrarFichas(lista) {

    if (!listaResumenFichas) {
        return;
    }


    listaResumenFichas.innerHTML = "";


    // -----------------------------------------
    // SIN RESULTADOS
    // -----------------------------------------

    if (!lista.length) {

        if (sinResultadosFichas) {

            sinResultadosFichas.style.display =
                "block";

        }

        return;

    }


    if (sinResultadosFichas) {

        sinResultadosFichas.style.display =
            "none";

    }


    // -----------------------------------------
    // CREAR CADA FICHA
    // -----------------------------------------

    lista.forEach(
        ficha => {

            const li =
                document.createElement("li");


            li.dataset.fichaId =
                ficha.id;


            li.innerHTML = `

                <div class="ficha-identificador">

                    Ficha
                    ${escaparHTML(
                        numeroFicha(ficha)
                    )}

                </div>


                <div class="ficha-programa">

                    ${escaparHTML(
                        nombrePrograma(ficha)
                    )}

                </div>


                <div class="ficha-accion">

                    <button
                        type="button"
                        class="btn-entrar-ficha">

                        <i class="fa-solid fa-arrow-right"></i>

                        Ingresar

                    </button>

                </div>

            `;


            const boton =
                li.querySelector(
                    ".btn-entrar-ficha"
                );


            if (boton) {

                boton.addEventListener(
                    "click",
                    function () {

                        ingresarAFicha(
                            ficha.id
                        );

                    }
                );

            }


            listaResumenFichas.appendChild(
                li
            );

        }
    );

}


// =========================================================
// INGRESAR A UNA FICHA
// =========================================================

function ingresarAFicha(idFicha) {

    if (!idFicha) {

        alert(
            "No se pudo identificar la ficha."
        );

        return;

    }


    // Guardamos la ficha actual
    localStorage.setItem(
        "id_ficha",
        idFicha
    );


    // Entramos directamente a principal
    window.location.href =
        "/principal";

}


// =========================================================
// BUSCADOR DE FICHAS
// =========================================================

if (buscarFichas) {

    buscarFichas.addEventListener(
        "input",
        function () {

            const texto =
                buscarFichas.value
                    .trim()
                    .toLowerCase();


            // -------------------------------------
            // BUSCADOR VACÍO
            // -------------------------------------

            if (!texto) {

                mostrarFichas(
                    fichasDisponibles
                );

                return;

            }


            // -------------------------------------
            // FILTRAR
            // -------------------------------------

            const filtradas =
                fichasDisponibles.filter(
                    ficha => {

                        const numero =
                            String(
                                numeroFicha(ficha)
                            )
                            .toLowerCase();


                        const programa =
                            String(
                                nombrePrograma(ficha)
                            )
                            .toLowerCase();


                        return (
                            numero.includes(texto) ||
                            programa.includes(texto)
                        );

                    }
                );


            mostrarFichas(
                filtradas
            );

        }
    );

}


// =========================================================
// NOVEDADES
// =========================================================


// =========================================================
// CARGAR NOVEDADES DE UNA FICHA
// =========================================================

async function cargarNotasFicha(
    idFichaNota
) {

    if (!notasTextoPanel ||
        !estadoNotasPanel) {

        return;

    }


    // -----------------------------------------
    // SIN FICHA
    // -----------------------------------------

    if (!idFichaNota) {

        notasTextoPanel.value =
            "";

        estadoNotasPanel.textContent =
            "Sin notas";

        return;

    }


    estadoNotasPanel.textContent =
        "Cargando...";


    try {

        const respuesta =
            await fetch(
                `/fichas/${idFichaNota}/notas`,
                {

                    method: "GET",

                    headers: {

                        "Authorization":
                            "Bearer " + token

                    }

                }
            );


        // -----------------------------------------
        // SESIÓN EXPIRADA
        // -----------------------------------------

        if (respuesta.status === 401) {

            localStorage.clear();

            window.location.href = "/";

            return;

        }


        const data =
            await respuesta.json();


        if (!respuesta.ok) {

            throw new Error(
                data.mensaje ||
                "No se pudieron cargar las novedades."
            );

        }


        // -----------------------------------------
        // MOSTRAR NOTAS
        // -----------------------------------------

        notasTextoPanel.value =
            data.notas || "";


        estadoNotasPanel.textContent =
            notasTextoPanel.value.trim()
                ? "Guardadas"
                : "Sin notas";


    } catch (error) {

        console.error(
            "Error cargando novedades:",
            error
        );


        estadoNotasPanel.textContent =
            "Error";

    }

}


// =========================================================
// CARGAR SELECTOR DE NOVEDADES
// =========================================================

function cargarSelectorNotas() {

    if (!notasFichaPanel) {
        return;
    }


    notasFichaPanel.innerHTML = `

        <option value="">
            Seleccione una ficha
        </option>

    `;


    fichasDisponibles.forEach(
        ficha => {

            const option =
                document.createElement("option");


            option.value =
                ficha.id;


            option.textContent =
                `Ficha ${numeroFicha(ficha)}` +
                (
                    nombrePrograma(ficha)
                        ? ` - ${nombrePrograma(ficha)}`
                        : ""
                );


            notasFichaPanel.appendChild(
                option
            );

        }
    );


    // -----------------------------------------
    // RECUPERAR FICHA ACTUAL
    // -----------------------------------------

    const fichaActual =
        localStorage.getItem(
            "id_ficha"
        );


    if (
        fichaActual &&
        fichasDisponibles.some(
            ficha =>
                String(ficha.id) ===
                String(fichaActual)
        )
    ) {

        notasFichaPanel.value =
            fichaActual;


        cargarNotasFicha(
            fichaActual
        );

    }

}


// =========================================================
// CAMBIAR FICHA EN NOVEDADES
// =========================================================

if (notasFichaPanel) {

    notasFichaPanel.addEventListener(
        "change",
        function () {

            const idFicha =
                notasFichaPanel.value;


            // -------------------------------------
            // SIN FICHA
            // -------------------------------------

            if (!idFicha) {

                if (notasTextoPanel) {

                    notasTextoPanel.value =
                        "";

                }


                if (estadoNotasPanel) {

                    estadoNotasPanel.textContent =
                        "Sin notas";

                }

                return;

            }


            // Guardar ficha actual
            localStorage.setItem(
                "id_ficha",
                idFicha
            );


            // Cargar novedades
            cargarNotasFicha(
                idFicha
            );

        }
    );

}


// =========================================================
// GUARDAR NOVEDADES
// =========================================================

if (btnGuardarNotasPanel) {

    btnGuardarNotasPanel.addEventListener(
        "click",
        async function () {

            const idFichaNota =
                notasFichaPanel
                    ? notasFichaPanel.value
                    : "";


            if (!idFichaNota) {

                alert(
                    "Seleccione una ficha."
                );

                return;

            }


            const texto =
                notasTextoPanel
                    ? notasTextoPanel.value
                    : "";


            const textoOriginal =
                btnGuardarNotasPanel.innerHTML;


            btnGuardarNotasPanel.disabled =
                true;


            btnGuardarNotasPanel.innerHTML = `

                <i class="fa-solid fa-spinner fa-spin"></i>

                Guardando...

            `;


            try {

                const respuesta =
                    await fetch(
                        `/fichas/${idFichaNota}/notas`,
                        {

                            method: "PUT",

                            headers: {

                                "Content-Type":
                                    "application/json",

                                "Authorization":
                                    "Bearer " + token

                            },

                            body: JSON.stringify({

                                notas: texto

                            })

                        }
                    );


                // -------------------------------------
                // SESIÓN EXPIRADA
                // -------------------------------------

                if (respuesta.status === 401) {

                    localStorage.clear();

                    window.location.href = "/";

                    return;

                }


                const data =
                    await respuesta.json();


                if (!respuesta.ok) {

                    throw new Error(
                        data.mensaje ||
                        "No se pudieron guardar las novedades."
                    );

                }


                // -------------------------------------
                // ACTUALIZAR ESTADO
                // -------------------------------------

                if (estadoNotasPanel) {

                    estadoNotasPanel.textContent =
                        texto.trim()
                            ? "Guardadas"
                            : "Sin notas";

                }


                alert(
                    "Novedades guardadas correctamente."
                );


            } catch (error) {

                console.error(
                    "Error guardando novedades:",
                    error
                );


                alert(
                    error.message ||
                    "Error al conectar con el servidor."
                );


            } finally {

                btnGuardarNotasPanel.disabled =
                    false;


                btnGuardarNotasPanel.innerHTML =
                    textoOriginal;

            }

        }
    );

}


// =========================================================
// PERFIL
// =========================================================


// =========================================================
// MOSTRAR FOTO
// =========================================================

function mostrarFotoPerfil(src) {

    // -----------------------------------------
    // AVATAR SUPERIOR
    // -----------------------------------------

    if (perfilAvatar) {

        perfilAvatar.innerHTML = `

            <img
                src="${src}"
                alt="Foto de perfil">

        `;

    }


    // -----------------------------------------
    // FOTO DEL MODAL
    // -----------------------------------------

    if (fotoPerfilPreview) {

        fotoPerfilPreview.innerHTML = `

            <img
                src="${src}"
                alt="Foto de perfil">

        `;

    }

}


// =========================================================
// MOSTRAR AVATAR POR DEFECTO
// =========================================================

function mostrarAvatarPorDefecto() {

    if (perfilAvatar) {

        perfilAvatar.innerHTML = `

            <i class="fa-solid fa-user"></i>

        `;

    }


    if (fotoPerfilPreview) {

        fotoPerfilPreview.innerHTML = `

            <i class="fa-solid fa-user"></i>

        `;

    }

}


// =========================================================
// MOSTRAR / OCULTAR BOTÓN QUITAR
// =========================================================

function actualizarBotonQuitar() {

    if (!btnQuitarFoto) {
        return;
    }

    const fotoGuardada =
        localStorage.getItem(
            "foto_perfil_instructor"
        );


    // Mostrar si existe una foto guardada
    // O si hay una foto nueva pendiente de aceptar

    if (
        (fotoGuardada && fotoGuardada.trim() !== "") ||
        fotoPerfilPendiente
    ) {

        btnQuitarFoto.hidden = false;

    } else {

        btnQuitarFoto.hidden = true;

    }

}


// =========================================================
// CARGAR FOTO GUARDADA
// =========================================================

function cargarFotoPerfil() {

    const fotoGuardada =
        localStorage.getItem(
            "foto_perfil_instructor"
        );


    if (fotoGuardada) {

        mostrarFotoPerfil(
            fotoGuardada
        );

    } else {

        mostrarAvatarPorDefecto();

    }


    actualizarBotonQuitar();

}


// =========================================================
// OCULTAR BOTONES DE CONFIRMACIÓN
// =========================================================

function ocultarBotonesFoto() {

    if (btnAceptarFoto) {

        btnAceptarFoto.style.display =
            "none";

    }


    if (btnCancelarFoto) {

        btnCancelarFoto.style.display =
            "none";

    }

}


// =========================================================
// MOSTRAR BOTONES DE CONFIRMACIÓN
// =========================================================

function mostrarBotonesFoto() {

    if (btnAceptarFoto) {
        btnAceptarFoto.style.display = "inline-flex";
    }

    if (btnCancelarFoto) {
        btnCancelarFoto.style.display = "inline-flex";
    }

    // NO ocultar Quitar foto.
    // Si ya existe una foto guardada,
    // debe continuar visible.

    actualizarBotonQuitar();

}


// =========================================================
// CARGAR PERFIL AL INICIAR
// =========================================================

cargarFotoPerfil();

ocultarBotonesFoto();


// =========================================================
// SELECCIONAR NUEVA FOTO
// =========================================================

if (fotoPerfil) {

    fotoPerfil.addEventListener(
        "change",
        function () {

            const archivo =
                fotoPerfil.files &&
                fotoPerfil.files[0];


            if (!archivo) {
                return;
            }


            // -------------------------------------
            // TIPOS PERMITIDOS
            // -------------------------------------

            const tiposPermitidos = [

                "image/jpeg",
                "image/png",
                "image/webp"

            ];


            if (
                !tiposPermitidos.includes(
                    archivo.type
                )
            ) {

                alert(
                    "Solo puedes seleccionar imágenes JPG, PNG o WEBP."
                );


                fotoPerfil.value =
                    "";


                return;

            }


            // -------------------------------------
            // TAMAÑO MÁXIMO: 5 MB
            // -------------------------------------

            if (
                archivo.size >
                5 * 1024 * 1024
            ) {

                alert(
                    "La imagen no puede superar los 5 MB."
                );


                fotoPerfil.value =
                    "";


                return;

            }


            // -------------------------------------
            // LEER IMAGEN
            // -------------------------------------

            const lector =
                new FileReader();


            lector.onload =
                function (evento) {

                    fotoPerfilPendiente =
                        evento.target.result;


                    // IMPORTANTE:
                    // solamente mostramos
                    // vista previa.
                    //
                    // Todavía NO guardamos.

                    mostrarFotoPerfil(
                        fotoPerfilPendiente
                    );


                    // Mostrar aceptar/cancelar

                    mostrarBotonesFoto();

                    actualizarBotonQuitar();

                };


            lector.readAsDataURL(
                archivo
            );

        }
    );

}


// =========================================================
// ACEPTAR NUEVA FOTO
// =========================================================

if (btnAceptarFoto) {

    btnAceptarFoto.addEventListener(
        "click",
        function () {

            if (!fotoPerfilPendiente) {
                return;
            }


            // -------------------------------------
            // AHORA SÍ SE GUARDA
            // -------------------------------------

            localStorage.setItem(
                "foto_perfil_instructor",
                fotoPerfilPendiente
            );


            // Limpiar pendiente

            fotoPerfilPendiente =
                null;

            actualizarBotonQuitar();


            // Limpiar input

            if (fotoPerfil) {

                fotoPerfil.value =
                    "";

            }


            // Ocultar aceptar/cancelar

            ocultarBotonesFoto();


            // Mostrar quitar

            actualizarBotonQuitar();


            // Mantener la imagen

            const fotoGuardada =
                localStorage.getItem(
                    "foto_perfil_instructor"
                );


            if (fotoGuardada) {

                mostrarFotoPerfil(
                    fotoGuardada
                );

            }


            alert(
                "Foto de perfil actualizada correctamente."
            );

        }
    );

}


// =========================================================
// CANCELAR CAMBIO DE FOTO
// =========================================================

if (btnCancelarFoto) {

    btnCancelarFoto.addEventListener(
        "click",
        function () {

            // -------------------------------------
            // DESCARTAR FOTO NUEVA
            // -------------------------------------

            fotoPerfilPendiente =
                null;


            // Limpiar input

            if (fotoPerfil) {

                fotoPerfil.value =
                    "";

            }


            // -------------------------------------
            // VOLVER A FOTO GUARDADA
            // -------------------------------------

            const fotoGuardada =
                localStorage.getItem(
                    "foto_perfil_instructor"
                );


            if (fotoGuardada) {

                mostrarFotoPerfil(
                    fotoGuardada
                );

            } else {

                mostrarAvatarPorDefecto();

            }


            // -------------------------------------
            // OCULTAR BOTONES
            // -------------------------------------

            ocultarBotonesFoto();


            actualizarBotonQuitar();

        }
    );

}


// =========================================================
// QUITAR FOTO
// =========================================================

if (btnQuitarFoto) {

    btnQuitarFoto.addEventListener(
        "click",
        function () {

            const fotoGuardada =
                localStorage.getItem(
                    "foto_perfil_instructor"
                );


            // =================================================
            // CASO 1:
            // HAY UNA FOTO NUEVA SIN ACEPTAR
            // =================================================

            if (fotoPerfilPendiente) {

                const confirmar =
                    confirm(
                        "¿Quieres quitar la foto seleccionada?"
                    );


                if (!confirmar) {
                    return;
                }


                // Eliminar foto pendiente

                fotoPerfilPendiente =
                    null;


                // Limpiar input

                if (fotoPerfil) {

                    fotoPerfil.value =
                        "";

                }


                // Volver a la foto guardada,
                // si existía alguna

                if (fotoGuardada) {

                    mostrarFotoPerfil(
                        fotoGuardada
                    );

                } else {

                    mostrarAvatarPorDefecto();

                }


                // Ocultar Aceptar y Cancelar

                ocultarBotonesFoto();


                // Actualizar botón Quitar

                actualizarBotonQuitar();


                return;

            }


            // =================================================
            // CASO 2:
            // HAY UNA FOTO GUARDADA
            // =================================================

            if (!fotoGuardada) {

                actualizarBotonQuitar();

                return;

            }


            const confirmar =
                confirm(
                    "¿Quieres quitar tu foto de perfil?"
                );


            if (!confirmar) {
                return;
            }


            // Eliminar foto guardada

            localStorage.removeItem(
                "foto_perfil_instructor"
            );


            fotoPerfilPendiente =
                null;


            // Limpiar input

            if (fotoPerfil) {

                fotoPerfil.value =
                    "";

            }


            // Mostrar avatar por defecto

            mostrarAvatarPorDefecto();


            // Ocultar Aceptar / Cancelar

            ocultarBotonesFoto();


            // Ahora sí desaparece Quitar

            actualizarBotonQuitar();

        }
    );

}


// =========================================================
// CERRAR SESIÓN
// =========================================================

if (btnCerrarSesion) {

    btnCerrarSesion.addEventListener(
        "click",
        function () {

            localStorage.removeItem("token");

            localStorage.removeItem(
                "id_usuario"
            );

            localStorage.removeItem(
                "nombre"
            );

            localStorage.removeItem(
                "rol"
            );

            localStorage.removeItem(
                "id_ficha"
            );


            /*
             * La foto de perfil NO se elimina
             * al cerrar sesión.
             */

            window.location.href = "/";

        }
    );

}


// =========================================================
// INICIAR PANEL
// =========================================================

cargarFichas();