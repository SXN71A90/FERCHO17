LFC - Comunidad de videos (con registro y publicación)

REQUISITOS
- Node.js 18 o superior.
- Conexión a internet para instalar las dependencias la primera vez.

INICIAR EN WINDOWS
1. Descomprime LFC_comunidad.zip.
2. Abre la carpeta LFC_comunidad en Visual Studio Code.
3. Abre Terminal > Nueva terminal.
4. Ejecuta: npm install
5. Ejecuta: npm start
6. Abre http://localhost:3000 en tu navegador.

FUNCIONES
- Registro e inicio de sesión por usuario.
- Contraseñas guardadas como hash (no en texto plano).
- Publicación de videos MP4, WebM, OGG o MOV (máximo 500 MB).
- Todos los usuarios ven los videos publicados.
- Cada usuario puede eliminar solamente sus propios videos.
- Buscador y sección "Mis videos".
- Archivos y cuentas se guardan en data/ y uploads/.

IMPORTANTE SOBRE INTERNET / VARIOS USUARIOS
En localhost solo pueden entrar personas que tengan acceso a tu computador o red local.
Para que cualquier persona desde internet pueda registrarse y publicar, debes desplegar este proyecto en un servidor que admita Node.js y almacenamiento persistente. Los videos ocupan espacio, por lo que conviene configurar límites, moderación y copias de seguridad.
Antes de publicarlo en internet:
- Cambia SESSION_SECRET por una clave larga y privada.
- Usa HTTPS.
- Configura almacenamiento persistente para /uploads y /data.
- Añade moderación y reglas de contenido.
El almacenamiento JSON de este proyecto es una base inicial para pruebas pequeñas, no una solución escalable para una comunidad grande.


NUEVAS FUNCIONES
- Comentarios en cada video: cualquier usuario registrado puede comentar; todos pueden leerlos.
- Likes: cada usuario registrado puede dar o quitar un like por video.
- Vistas: se suma una vista al abrir cada video, una vez por sesión y por video.
- Buscador con sugerencias en vivo: encuentra videos por título, descripción o nombre de usuario.
- Nombre/título obligatorio al publicar cada video.
- Los datos de comentarios y likes se guardan en data/comments.json y data/likes.json.

Nota: Las vistas son un contador básico por sesión del navegador, no una medición antifraude.
