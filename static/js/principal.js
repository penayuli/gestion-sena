const token = localStorage.getItem("token");
const idFicha = localStorage.getItem("id_ficha");

async function cargarFicha(){

    const respuesta = await fetch(`/ficha/${idFicha}`,{

        headers:{
            Authorization:"Bearer " + token
        }

    });

    const ficha = await respuesta.json();

    document.getElementById("numeroFicha").innerHTML =
        "Ficha " + (ficha.numero_ficha || ficha.numero || "Sin número");

    document.getElementById("fechaInicio").innerHTML =
        ficha.fecha_inicio;

    document.getElementById("fechaFin").innerHTML =
        ficha.fecha_fin;

    document.getElementById("trimestre").innerHTML =
        ficha.trimestre;

    document.getElementById("estado").innerHTML =
        ficha.estado;

}

cargarFicha();