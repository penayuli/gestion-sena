// ==========================================
// MOSTRAR / OCULTAR CONTRASEÑA LOGIN
// ==========================================

const btnMostrar = document.getElementById("mostrar");
const inputPassword = document.getElementById("password");

btnMostrar.addEventListener("click", () => {

    if (inputPassword.type === "password") {

        inputPassword.type = "text";
        btnMostrar.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';

    } else {

        inputPassword.type = "password";
        btnMostrar.innerHTML = '<i class="fa-solid fa-eye"></i>';

    }

});

// ==========================================
// MODALES
// ==========================================

const modalRegistro = new bootstrap.Modal(
    document.getElementById("modalRegistro")
);

document.getElementById("abrirRegistro").addEventListener("click", (e) => {

    e.preventDefault();
    modalRegistro.show();

});

// ==========================================
// MENSAJES
// ==========================================

function mostrarMensaje(texto, tipo) {

    const mensaje = document.getElementById("mensaje");

    mensaje.className = "alert";

    if (tipo === "success") {

        mensaje.classList.add("alert-success");

    } else {

        mensaje.classList.add("alert-danger");

    }

    mensaje.innerHTML = texto;

    mensaje.classList.remove("d-none");

    setTimeout(() => {

        mensaje.classList.add("d-none");

    }, 3000);

}

// ==========================================
// VALIDAR CONTRASEÑA
// ==========================================

const passwordRegistro = document.getElementById("passwordRegistro");

passwordRegistro.addEventListener("keyup", () => {

    const password = passwordRegistro.value;

    validar(password.length >= 8, "longitud");
    validar(/[A-Z]/.test(password), "mayuscula");
    validar(/[a-z]/.test(password), "minuscula");
    validar(/[0-9]/.test(password), "numero");

});

function validar(condicion, id) {

    const elemento = document.getElementById(id);

    if (condicion) {

        elemento.classList.remove("text-danger");
        elemento.classList.add("text-success");
        elemento.innerHTML = elemento.innerHTML.replace("❌", "✅");

    } else {

        elemento.classList.remove("text-success");
        elemento.classList.add("text-danger");
        elemento.innerHTML = elemento.innerHTML.replace("✅", "❌");

    }

}

// ==========================================
// LOGIN
// ==========================================

const formLogin = document.getElementById("formLogin");

formLogin.addEventListener("submit", async (e) => {

    e.preventDefault();

    const correo = document.getElementById("correo").value;
    const password = document.getElementById("password").value;

    try {

        const respuesta = await fetch("/login", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                correo,
                password
            })

        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {

            mostrarMensaje(datos.mensaje, "error");
            return;

        }

        // Guardar datos
        localStorage.setItem("token", datos.token);
        localStorage.setItem("id_usuario", datos.usuario.id);
        localStorage.setItem("nombre", datos.usuario.nombre);
        localStorage.setItem("rol", datos.usuario.rol);

        // Administrador entra directo al dashboard administrativo
        if (datos.usuario.rol === "Administrador") {

            window.location.href = "/dashboard";
            return;

        }

        // El auxiliar tiene su propio panel administrativo.
        if (datos.usuario.rol === "Auxiliar") {
            window.location.href = "/panel_auxiliar";
            return;
        }

        // El instructor entra a su panel para seleccionar la ficha.
        window.location.href = "/panel_instructor";

    } catch (error) {

        console.error(error);

        mostrarMensaje(
            "Error al conectar con el servidor.",
            "error"
        );

    }

});

// ==========================================
// REGISTRO
// ==========================================

const formRegistro = document.getElementById("formRegistro");

formRegistro.addEventListener("submit", async (e) => {

    e.preventDefault();

    const password = document.getElementById("passwordRegistro").value;
    const confirmar = document.getElementById("confirmar").value;

    if (password !== confirmar) {

        mostrarMensaje(
            "Las contraseñas no coinciden.",
            "error"
        );

        return;

    }

    if (

        password.length < 8 ||

        !/[A-Z]/.test(password) ||

        !/[a-z]/.test(password) ||

        !/[0-9]/.test(password)

    ) {

        mostrarMensaje(

            "La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.",

            "error"

        );

        return;

    }

    const datos = {

        nombre: document.getElementById("nombre").value,
        apellido: document.getElementById("apellido").value,
        correo: document.getElementById("correoRegistro").value,
        password: password,
        rol: document.getElementById("rol").value

    };

    try {

        const respuesta = await fetch("/registro", {

            method: "POST",

            headers: {

                "Content-Type": "application/json"

            },

            body: JSON.stringify(datos)

        });

        const resultado = await respuesta.json();

        if (respuesta.ok) {

            mostrarMensaje(

                "Usuario registrado correctamente.",

                "success"

            );

            formRegistro.reset();

            modalRegistro.hide();

        } else {

            mostrarMensaje(resultado.mensaje, "error");

        }

    } catch (error) {

        console.error(error);

        mostrarMensaje(

            "Error al conectar con el servidor.",

            "error"

        );

    }

});