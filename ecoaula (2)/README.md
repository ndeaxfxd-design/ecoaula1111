# EcoAula · Resultados del alumno + Excel del docente

**Flujo simplificado**

- El estudiante abre `index.html`, selecciona las respuestas ilustradas (7 preguntas principales y 2 condicionales) y pulsa **Enviar y ver mi impacto aquí**.
- El resultado aparece **debajo de las preguntas en la misma página**, con subtotal orientativo en kg CO₂e/mes y desglose por transporte, electricidad y carne de res. No necesita abrir otro enlace.
- El docente abre **Descargar Excel · docente**, inicia sesión con un correo autorizado, filtra por curso y descarga **CSV compatible con Excel**. Una fila por alumno; columnas con respuestas y emisiones estimadas.
- **El CSV no se genera automáticamente en la computadora del docente cuando un alumno responde**. Los datos se guardan en Supabase y el docente descarga el Excel cuando lo necesite.
- El modo demostración **solo guarda respuestas en ese navegador**, si permite almacenamiento. En una vista previa que bloquee localStorage, el resultado se muestra igualmente, pero el registro es temporal y no llega al docente. Para reunir respuestas desde distintos celulares, configura Supabase.

**Configuración:** sigue los pasos incluidos abajo. No se debe compartir una clave secreta de Supabase en el sitio.

# EcoAula: encuesta de 7 preguntas con impacto individual

Esta es una página estática lista para GitHub y Vercel, sin instalar Node ni compilar.

## Uso

El estudiante ve todas las preguntas en una sola página y selecciona botones con iconos. Son **7 preguntas principales** y hay dos opciones condicionales: combustible solo para moto/auto y tamaño de porción solo si consume carne de res. La encuesta toma aprox. 2 minutos.

Los datos registrados son: código seudónimo del alumno, curso, respuestas originales y tres indicadores aproximados: kilómetros semanales de ida y vuelta, consumo eléctrico mensual del hogar dividido por número de personas, y kilogramos aproximados de carne de res semanal.

**Versión actualizada:** además de los indicadores de actividad, el alumno ve un desglose en **kg CO₂e/mes** con tres fuentes: desplazamiento universitario, electricidad doméstica repartida por persona y carne de res. **No es la huella total**, solo una estimación educativa de estas tres fuentes. El panel y el CSV también incluyen los resultados individuales y parciales. Los rangos son imprecisos; se usan puntos medios elegidos con fines educativos. «Más de 20 km» se aproxima como 25 km, «más de 300 kWh» como 350 kWh y «6 o más personas» como 6.

## Demostración rápida

Abre `index.html` desde el archivo ZIP descomprimido en un navegador. El modo demostración almacena respuestas **únicamente en el navegador y equipo utilizados**, no reúne celulares distintos. En el panel se puede filtrar por curso y presionar **Exportar a Excel (CSV)**; el CSV usa UTF-8 con BOM y separador de punto y coma, que abre en Excel en español.

## Para que todas las respuestas de los alumnos lleguen a un mismo lugar

1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta `schema.sql`. Si existían tablas antiguas, esta versión crea la nueva tabla `encuestas_v2` y conserva las anteriores.
3. En **Authentication > Providers**, habilita **Anonymous Sign-ins** y **Email**.
4. Abre `config.js` y coloca la URL del proyecto y su clave **publishable** pública. **Jamás uses la clave secreta (`service_role`/`secret`) en un archivo del sitio.**
5. Sube la carpeta del sitio a GitHub y conéctala a Vercel. En Vercel se despliega como **Other / Static**, sin comando build.
6. En Supabase > **Authentication > URL Configuration**, configura como **Site URL** y **Redirect URLs** la URL que te dio Vercel, para que funcione el enlace de correo del docente.
7. Abre la página desplegada, ingresa al **Panel docente**, introduce tu correo y abre el enlace recibido. A continuación, en SQL Editor ejecuta (reemplazando el correo):

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email='TU_CORREO_REAL'
   on conflict do nothing;
   ```
8. Recarga el panel. Ahora puedes consultar el conjunto de alumnos de cualquier celular y exportar a Excel (CSV).

**Acceso:** la política RLS permite que los alumnos solo inserten una respuesta asociada a su sesión anónima; impide que lean las respuestas de los demás. El panel exige usuario docente no anónimo incluido en `admin_users`. No hay acceso administrativo desde un código incluido en el navegador.

**Limitaciones operativas:** al ser una encuesta sin contraseñas de estudiantes, los códigos se pueden suplantar. Entrega códigos individuales, supervisa el proceso, limita difusión del enlace y habilita CAPTCHA para controlar abuso en una aplicación pública. Una sesión anónima solo envía una respuesta, y el mismo código no se puede repetir en un curso. Por privacidad, no se piden nombres ni correos a los alumnos.

## Método estadístico

- `km_traslado_semanal = distancia_ida_aproximada × 2 × días_semana_aproximados`.
- `kWh_persona_mes = kWh_hogar_mes_aproximados ÷ personas_hogar`; si marca «No sé», el dato queda faltante y se excluye de promedios.
- `kg_carne_res_semana = ocasiones_semana_aproximadas × gramos_porción_aproximados / 1000`; si no consume, vale 0.
- Las medidas grupales incluyen **media, mediana, desviación estándar poblacional y frecuencias**. Se exporta la respuesta textual original, para análisis descriptivo en Excel.

Fuentes para orientar futuras conversiones a CO₂e: [GHG Protocol, método de distancia para transporte](https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf); [Our World in Data, emisiones asociadas a alimentos](https://ourworldindata.org/grapher/ghg-per-kg-poore); [Supabase, autenticación anónima](https://supabase.com/docs/guides/auth/auth-anonymous).


## Factores y cálculo de emisiones orientativo

Las emisiones individuales estimadas se obtienen multiplicando la actividad cuantificada por un factor de referencia. Se utiliza **mes medio = 52/12 semanas**.

- Micro: `km/mes × 0,10151 kg CO₂e/pasajero·km` (transporte público promedio del Reino Unido, 2026).
- Auto gasolina: `km/mes × 0,16152 kg CO₂e/vehículo·km`; auto diésel: `× 0,17265` (auto medio Reino Unido 2026). Se atribuye el trayecto completo a quien responde, sin compartir por ocupantes; un taxi compartido daría una sobreestimación.
- Moto gasolina: `km/mes × 0,11367 kg CO₂e/vehículo·km` (moto media Reino Unido 2026).
- Auto eléctrico: `km/mes × 0,2171 kWh/km × 0,481 kg CO₂e/kWh` (consumo de vehículo de referencia × electricidad Bolivia 2025, como proxy).
- Pie/bicicleta: 0 emisiones **operativas del desplazamiento**, no cero huella de ciclo de vida.
- Auto GNV, moto eléctrica o diésel, combustible «No sé»: **sin estimación de transporte**, nunca se registran como emisiones cero.
- Electricidad: `(kWh hogar/mes ÷ habitantes) × 0,481 kg CO₂e/kWh`, factor promedio de generación de Bolivia 2025 basado en Ember; incluye matices de ciclo de vida y no es una medición de un proveedor concreto. Si se responde «No sé», queda sin dato.
- Carne de res: `kg/semana × (52/12) × 99,48 kg CO₂e/kg`, factor global orientativo de carne de ganado de carne según Poore & Nemecek (2018), vía Our World in Data. La producción local puede diferir considerablemente, así como la procedencia de la carne. **No es la alimentación total**.
- **Subtotal:** suma de las emisiones estimables. Si alguna falta, se indica expresamente «parcial». Las comparaciones entre transporte, electricidad y alimentos requieren cautela porque los factores pueden tener diferentes límites de inventario; todos son valores educativos orientativos.
- En exportación CSV se conservan `transporte_co2e_mes`, `electricidad_co2e_mes`, `res_co2e_mes`, `subtotal_co2e_mes` y `subtotal_completo` además de las respuestas originales.

Fuentes de referencia:

- DESNZ/DEFRA (2026), factores oficiales para Reino Unido: <https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026>. Datos de factor 2026 explicados en <https://greencalculus.com/factors/passenger-vehicle-emission-factors/> y <https://www.greentryst.com/emission-factors/road-business-travel-bus-average-local-bus-scope-3-defra-2026?family=c956c64c0d90&unit=passenger.km>.
- Ember (2025), intensidad promedio de electricidad generada en Bolivia: <https://ember-energy.org/data/electricity-data-explorer/> y <https://www.worldpowermonitor.com/es/paises/bolivia/>.
- Our World in Data, emisiones mundiales asociadas con carne de res: <https://ourworldindata.org/grapher/ghg-per-kg-poore>.
- Energy Saving Trust, referencia de consumo de auto eléctrico: <https://fleetdecarbonisationtoolkit.energysavingtrust.org.uk/t/decarbonisation-strategy/emissions-calculated/car-van-ghg-kwh-calculations-2/>.

**Compatibilidad:** no se cambia la tabla ni la versión del instrumento, porque las 7 preguntas siguen idénticas. Las emisiones se recalculan también para los registros anteriores a esta mejora a partir de las respuestas guardadas, por lo que el panel y el CSV permiten reutilizarlos. La tabla `encuestas_v2` tiene columnas JSONB para almacenar los campos nuevos.
