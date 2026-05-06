# ChampionHub - Gestión de Campeonatos Deportivos

Una aplicación web completa para la gestión de campeonatos deportivos con autenticación, roles, estadísticas y más.

## Características Principales

### Roles de Usuario
- **Administrador del Sistema**: Acceso total, gestión de usuarios y campeonatos
- **Administrador de Campeonato**: Gestión de su campeonato específico
- **Usuario/Capitán**: Visualización de campeonatos y gestión de equipos

### Funcionalidades

#### Para Todos los Usuarios
- Explorar campeonatos activos
- Buscar campeonatos por nombre, recinto o equipo
- Ver tablas de posiciones y estadísticas
- Ranking de goleadores
- Calendario de partidos

#### Para Capitanes de Equipo
- Gestionar jugadores del equipo
- Enviar y responder desafíos a otros equipos
- Invitar jugadores
- Ver mensajes

#### Para Administradores de Campeonato
- Crear y gestionar equipos
- Programar partidos
- Registrar resultados y estadísticas
- Gestionar sanciones

#### Para Administradores del Sistema
- Crear campeonatos
- Asignar administradores de campeonato
- Gestión completa de la plataforma

## Tecnologías Utilizadas

- **Frontend**: React + TypeScript + Vite
- **Estilos**: Tailwind CSS
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Iconos**: Lucide React

## Estructura de la Base de Datos

### Tablas Principales
- `profiles`: Perfiles de usuario con roles
- `championships`: Campeonatos deportivos
- `teams`: Equipos en campeonatos
- `players`: Jugadores en equipos
- `matches`: Partidos programados y finalizados
- `match_stats`: Estadísticas por partido
- `sanctions`: Sanciones a jugadores
- `challenges`: Desafíos entre equipos
- `messages`: Mensajería entre usuarios
- `invitations`: Invitaciones a jugadores

## Comenzar a Usar

### 1. Registro de Usuario
1. Haz clic en "Registrarse"
2. Completa el formulario con tu nombre, email y contraseña
3. Inicia sesión con tus credenciales

### 2. Explorar Campeonatos
- La página principal muestra campeonatos activos
- Usa el buscador para filtrar por deporte, estado o nombre
- Haz clic en un campeonato para ver detalles completos

### 3. Ver Estadísticas
- Tabla de posiciones con puntos, partidos jugados y diferencia de goles
- Ranking de goleadores
- Calendario de partidos con resultados

### 4. Gestionar Equipos (Solo Capitanes)
1. Ve a "Mis Equipos" en el menú
2. Gestiona jugadores de tu equipo
3. Envía desafíos a otros equipos
4. Invita nuevos jugadores

### 5. Administrar Campeonatos (Solo Administradores)
1. Accede al panel de administración
2. Selecciona tu campeonato
3. Gestiona equipos, partidos y sanciones
4. Registra resultados de partidos

## Datos de Ejemplo

La aplicación incluye datos de muestra:
- 3 campeonatos (2 activos, 1 borrador)
- Múltiples equipos con jugadores
- Partidos finalizados y programados
- Estadísticas de goleadores

## Navegación

- **Inicio**: Campeonatos destacados y rankings
- **Buscar**: Explorador de campeonatos con filtros
- **Mis Equipos**: Gestión de equipos (requiere autenticación)
- **Mensajes**: Comunicación entre usuarios (requiere autenticación)
- **Administrar**: Panel de control (solo administradores)

## Seguridad

- Autenticación segura con Supabase
- Row Level Security (RLS) en todas las tablas
- Permisos basados en roles
- Protección de rutas según permisos

## Próximas Características

- Sistema de notificaciones en tiempo real
- Chat en vivo entre capitanes
- Exportación de estadísticas
- Integración con calendarios
- Aplicación móvil

## Desarrollo

```bash
npm install
npm run dev
```

Para producción:
```bash
npm run build
```

## Soporte Multi-Deporte

La aplicación está diseñada para soportar múltiples deportes. Actualmente incluye:
- Fútbol (con goles, tarjetas amarillas/rojas, asistencias)
- Basketball
- Otros deportes pueden agregarse fácilmente

## Contribuir

Esta es una aplicación completa lista para producción. Puede extenderse con:
- Nuevos deportes y estadísticas específicas
- Integraciones con redes sociales
- Sistema de pagos para inscripciones
- Transmisión en vivo de partidos
