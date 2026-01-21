# Proyecta

**Proyecta** es una aplicación web para la gestión de proyectos y equipos, con tablero Kanban, gestión de tareas y colaboración en tiempo real usando Firebase.

## Características

- Autenticación de usuarios (registro, login, logout)
- Gestión de proyectos: crea, edita y visualiza proyectos
- Tablero Kanban para tareas: arrastra y suelta tareas entre estados
- Gestión de equipos: invita miembros, asigna roles y gestiona el equipo
- Asignación de tareas y prioridades
- Indicadores visuales de fechas y estados
- Interfaz responsiva y moderna
- Sincronización en tiempo real con Firebase

## Estructura del proyecto

```
public/
  ├── app.js           # Lógica principal de la app (Firebase, UI, Kanban, equipos)
  ├── index.html       # Pantalla principal (login, registro, app)
  ├── landing.html     # Landing page de marketing
  ├── manifest.json    # PWA manifest
  ├── styles.css       # Estilos personalizados
  └── icon.png         # Icono de la app
firebase.json          # Configuración de Firebase Hosting
.firebaserc            # Configuración de proyecto Firebase CLI
.gitignore             # Archivos ignorados por git
```

## Instalación y despliegue

1. **Clona el repositorio:**
   ```sh
   git clone git@github.com:alvaroku/proyecta-app.git
   cd proyecta
   ```

2. **Configura Firebase:**
   - Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
   - Habilita Firestore y Authentication (Email/Password).
   - Copia tu configuración en `public/app.js` (ya está incluida en el ejemplo).

3. **Despliega en Firebase Hosting:**
   ```sh
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   firebase deploy
   ```

## Uso

- Accede a la landing page (`landing.html`) para información y registro.
- Inicia sesión en la app (`index.html`) para gestionar tus proyectos y tareas.
- Invita miembros por email y asigna roles en cada proyecto.

## Tecnologías

- [Firebase](https://firebase.google.com/) (Auth, Firestore, Hosting)
- HTML, CSS (Tailwind), JavaScript
- PWA ready

## Contribuir

¡Las contribuciones son bienvenidas! Abre un issue o pull request para sugerencias, mejoras o correcciones.

---

**Proyecta** © 2026. Organiza tus proyectos con simplicidad.
