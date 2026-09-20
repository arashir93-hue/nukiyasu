# Nukiyasu

**Nukiyasu** es un servidor personal y autohospedado para leer manga y novelas ligeras en japonés desde tu propia biblioteca.

Es un fork de [Yomiyasu](https://github.com/alexay7/yomiyasu) que mantiene su arquitectura y funciones principales e incorpora, entre otras mejoras, soporte opcional para contenido adulto, controles de acceso adicionales y una aplicación Android preparada para conectarse a cualquier servidor Nukiyasu.

## Características

- Lectura de manga procesado con Mokuro.
- Lectura de manga almacenado directamente como imágenes.
- Lectura de novelas ligeras en formato EPUB.
- Progreso de lectura sincronizado.
- Historial y estadísticas de lectura.
- Diccionario japonés integrado.
- Soporte multiusuario.
- Panel de administración.
- Aplicación nativa para Android.
- Servidor completamente autohospedado.
- Control opcional de contenido adulto por usuario.

> [!IMPORTANT]
> ## Contenido adquirido legalmente
>
> Nukiyasu no incluye, distribuye ni descarga manga, novelas ni otros libros.
>
> Está diseñado para organizar y leer tu propia biblioteca desde tus propios dispositivos. Solo debes incorporar contenido que hayas adquirido legalmente y tengas derecho a utilizar.

---

# Instalación con Docker

## Requisitos

Necesitas:

- Un ordenador, servidor, NAS o VPS con Docker.
- Docker Compose v2 (`docker compose`).
- Git.
- Espacio para almacenar tu biblioteca.

Nukiyasu utiliza varios servicios internamente:

- Backend de Nukiyasu
- Frontend web
- MongoDB
- Redis
- TTU Ebook Reader

Docker se encarga de desplegarlos.

## 1. Clonar Nukiyasu

```bash
git clone https://github.com/arashir93-hue/nukiyasu.git
cd nukiyasu
```

Copia el compose de ejemplo:

```bash
cp docker-compose.example.yml docker-compose.yml
```

> `docker-compose.yml` está ignorado por Git para que puedas modificar tu configuración local sin subir secretos o rutas personales al repositorio.

---

# 2. Preparar la biblioteca

Crea una carpeta para la biblioteca. Por ejemplo:

```text
nukiyasu-library/
├── mangas/
└── novelas/
```

Puedes colocarla donde quieras siempre que Docker tenga acceso a ella.

Por ejemplo:

```text
/mnt/storage/nukiyasu-library
```

## Manga procesado con Mokuro

Cada serie debe tener su propia carpeta:

```text
nukiyasu-library/
└── mangas/
    └── Mi Serie/
        ├── Volumen 01.html
        ├── Volumen 01_files/
        ├── Volumen 02.html
        └── Volumen 02_files/
```

El `.html` y su correspondiente carpeta de imágenes deben permanecer juntos.

## Manga basado en imágenes

Nukiyasu también puede registrar tomos formados directamente por imágenes:

```text
nukiyasu-library/
└── mangas/
    └── Mi Serie/
        ├── Volumen 01/
        │   ├── 001.webp
        │   ├── 002.webp
        │   ├── 003.webp
        │   └── ...
        └── Volumen 02/
            ├── 001.jpg
            ├── 002.jpg
            └── ...
```

Se admiten imágenes:

```text
.jpg
.jpeg
.png
.webp
.avif
```

Las páginas se ordenan de forma natural según sus nombres.

## Novelas ligeras

Las novelas deben estar en formato EPUB:

```text
nukiyasu-library/
└── novelas/
    └── Mi Novela/
        ├── Volumen 01.epub
        ├── Volumen 02.epub
        └── ...
```

El nombre de la carpeta se utilizará inicialmente como nombre de la serie.

---

# 3. Configurar Docker

Edita:

```text
docker-compose.yml
```

## Biblioteca

Busca:

```yaml
- /ruta/a/nukiyasu-library:/usr/src/exterior
```

y sustituye la parte izquierda por la ruta absoluta de tu biblioteca.

Por ejemplo:

```yaml
- /mnt/storage/nukiyasu-library:/usr/src/exterior
```

No cambies:

```text
/usr/src/exterior
```

porque es la ruta utilizada internamente por Nukiyasu.

## Secretos

Genera dos secretos diferentes:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Introduce cada resultado en:

```yaml
ACCESS_SECRET: "..."
REFRESH_SECRET: "..."
```

No publiques estos valores.

Si cambias los secretos posteriormente, las sesiones existentes dejarán de ser válidas y los usuarios tendrán que volver a iniciar sesión.

## Puerto

Por defecto:

```yaml
ports:
  - "8080:80"
```

Nukiyasu estará disponible en:

```text
http://IP-DEL-SERVIDOR:8080
```

Puedes sustituir `8080` por cualquier puerto libre.

---

# 4. Diccionarios

Nukiyasu puede utilizar diccionarios para sus funciones de vocabulario japonés.

La carpeta:

```text
dicts/
```

se monta en:

```text
/usr/src/dicts
```

Los archivos utilizados por el backend pueden incluir:

```text
dicts/
├── jmdict-eng-3.5.0.json
├── frequency.json
├── pitch.json
└── jmdict/
```

Si no utilizas estas funciones, puedes mantener `dicts/` vacío.

La ausencia de los diccionarios no impide utilizar las funciones principales de lectura de Nukiyasu.

---

# 5. Iniciar Nukiyasu

Construye e inicia todos los servicios:

```bash
docker compose up -d --build
```

Puedes comprobar su estado con:

```bash
docker compose ps
```

Cuando todos los servicios estén funcionando, abre:

```text
http://IP-DEL-SERVIDOR:8080
```

---

# 6. Primer usuario

El primer usuario registrado en una instalación nueva se convierte automáticamente en **administrador**.

Los administradores tienen acceso a funciones adicionales de gestión de la biblioteca y de las series.

---

# 7. Escanear la biblioteca

Después de iniciar sesión:

1. Abre **Biblioteca**.
2. Selecciona manga o novelas.
3. Pulsa **Reescanear biblioteca**.

Nukiyasu analizará las carpetas, registrará las series y tomos encontrados y generará las miniaturas necesarias.

Cuando añadas nuevos libros posteriormente, vuelve a ejecutar el escaneo.

---

# Contenido adulto

Nukiyasu incorpora soporte opcional para contenido adulto o maduro.

Un administrador puede marcar una serie como contenido adulto.

Cada usuario dispone de una preferencia para decidir si quiere mostrar este tipo de contenido.

Cuando está desactivado, Nukiyasu oculta el contenido marcado como adulto de las principales áreas de la aplicación y protege también su acceso desde el backend.

Cambiar esta preferencia no elimina libros, progreso ni estadísticas. El contenido vuelve a aparecer al habilitarlo de nuevo.

---

# Android

Nukiyasu dispone de una aplicación Android independiente del servidor.

Puedes descargar el APK desde las [Releases de Nukiyasu](https://github.com/arashir93-hue/nukiyasu/releases).

Al abrir la aplicación por primera vez, introduce la URL de tu servidor.

En una red local podría ser:

```text
http://192.168.1.50:8080
```

Si tienes Nukiyasu publicado mediante HTTPS:

```text
https://nukiyasu.ejemplo.com
```

La dirección queda almacenada en el dispositivo.

La aplicación no está vinculada a una instancia concreta de Nukiyasu: cada usuario puede conectarla a su propio servidor.

---

# Acceso remoto y HTTPS

Para utilizar Nukiyasu fuera de tu red local se recomienda publicarlo mediante HTTPS.

Puedes utilizar, entre otras opciones:

- Cloudflare Tunnel
- Caddy
- nginx
- Otro proxy inverso compatible con WebSockets

El proxy debe permitir WebSockets porque Nukiyasu utiliza `/socket.io` para determinadas funciones de sincronización.

Por ejemplo, con Caddy:

```caddyfile
nukiyasu.ejemplo.com {
    reverse_proxy 127.0.0.1:8080
}
```

No es necesario exponer MongoDB ni Redis a Internet.

---

# Actualizar Nukiyasu

Antes de actualizar es recomendable disponer de una copia de seguridad.

Desde el repositorio:

```bash
git pull
docker compose up -d --build
```

Docker reconstruirá los componentes que hayan cambiado.

Puedes comprobar después:

```bash
docker compose ps
```

---

# Copias de seguridad

## Biblioteca

La biblioteca está almacenada directamente en la ruta que hayas configurado como:

```text
/ruta/a/nukiyasu-library
```

Haz copias de seguridad de esta carpeta como de cualquier otra biblioteca.

## Base de datos

MongoDB contiene información como usuarios, configuración y progreso de lectura.

Puedes crear una copia mediante:

```bash
docker compose exec mongodb mongodump --archive --gzip > copia-nukiyasu.gz
```

Guarda esta copia junto con las copias de seguridad de tu biblioteca.

> [!WARNING]
> `docker compose down` conserva normalmente los volúmenes.
>
> No utilices `docker compose down -v` salvo que realmente quieras eliminar los volúmenes de Docker, ya que `-v` puede borrar los datos persistentes de MongoDB y Redis.

---

# Solución de problemas

## La web no abre

Comprueba:

```bash
docker compose ps
```

y los logs:

```bash
docker compose logs
```

Para seguir los logs del backend:

```bash
docker compose logs -f api
```

## Los libros aparecen pero las imágenes no cargan

Comprueba que la ruta configurada en:

```yaml
/ruta/a/nukiyasu-library:/usr/src/exterior
```

sea correcta.

Puedes comprobar qué ve el backend con:

```bash
docker compose exec api ls -lah /usr/src/exterior
```

Deberían aparecer al menos:

```text
mangas
novelas
```

## He añadido libros pero no aparecen

Ejecuta de nuevo **Reescanear biblioteca** desde Nukiyasu.

## El puerto 8080 está ocupado

Cambia:

```yaml
- "8080:80"
```

por otro puerto, por ejemplo:

```yaml
- "8085:80"
```

y ejecuta:

```bash
docker compose up -d
```

## El diccionario no funciona

Comprueba los archivos de `dicts/`.

Las funciones principales de biblioteca y lectura pueden seguir utilizándose sin los diccionarios.

---

# Desarrollo

Nukiyasu está dividido principalmente en:

```text
back/       Backend
front/      Aplicación web
android/    Aplicación Android
ios/        Código iOS heredado de Yomiyasu
```

El backend y el frontend se construyen desde el código del propio repositorio mediante los Dockerfiles incluidos.

Algunos identificadores internos conservan el nombre `yomiyasu` por compatibilidad con la arquitectura original. Esto es intencionado y no implica que se esté ejecutando el backend o frontend original.

---

# Créditos

Nukiyasu es un fork de **Yomiyasu**, creado por [alexay7](https://github.com/alexay7/yomiyasu).

El proyecto conserva y adapta una parte importante de la arquitectura y funcionalidades del proyecto original.

El lector EPUB integrado utiliza [TTU Reader / ttu-yomiyasu](https://github.com/alexay7/ttu-yomiyasu).

Mokuro es desarrollado por [kha-white](https://github.com/kha-white/mokuro).

## Licencia

Nukiyasu se distribuye bajo la licencia [GPL-3.0](LICENSE).