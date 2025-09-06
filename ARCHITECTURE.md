# Arquitectura del Proyecto ServiVENT

## 1. Propósito

Este documento describe la arquitectura de la aplicación ServiVENT, su estructura de archivos y las convenciones de codificación. El objetivo es mantener una base de código limpia, escalable y fácil de mantener a medida que el proyecto crece.

## 2. Filosofía Principal

-   **Separación de Responsabilidades (SoC):** Cada archivo y componente tiene un propósito claro y único. La lógica de la aplicación, los componentes de la UI, las definiciones de tipos y la configuración del cliente están desacoplados.
-   **Arquitectura Basada en Componentes:** La interfaz de usuario se construye a partir de componentes pequeños, reutilizables y componibles.
-   **Centralización de Tipos:** Se utiliza un único archivo (`types.ts`) para todas las definiciones de tipos de TypeScript, garantizando la coherencia y evitando la duplicación.

## 3. Estructura de Directorios

La estructura de archivos está organizada para reflejar la separación de responsabilidades:

```
/
├── index.html            # Punto de entrada HTML
├── index.css             # Hoja de estilos global
├── index.tsx             # Punto de entrada de React (solo para renderizar App)
├── App.tsx               # Componente raíz de la aplicación
├── supabaseClient.ts     # Configuración y exportación del cliente Supabase
├── types.ts              # Definiciones de interfaces y tipos de TypeScript
├── ARCHITECTURE.md       # Este documento
│
├── components/           # Componentes de UI reutilizables
│   ├── Avatar.tsx
│   ├── Header.tsx
│   ├── ProfileMenu.tsx
│   └── Sidebar.tsx
│
└── pages/                # Componentes que representan una página/vista completa
    ├── Dashboard.tsx
    ├── ProductsPage.tsx
    ├── BranchesPage.tsx
    ├── UsersPage.tsx
    ├── LoginPage.tsx
    └── InitialSetupPage.tsx
```

### Descripción de Archivos Clave

-   **`index.tsx`**: Su única responsabilidad es montar el componente `App` en el DOM. No contiene lógica de aplicación.
-   **`App.tsx`**: Es el orquestador principal. Gestiona el estado global como la sesión de autenticación y el perfil del usuario. Contiene la lógica de enrutamiento principal para decidir qué página mostrar (`LoginPage`, `InitialSetupPage` o el layout principal de la aplicación).
-   **`supabaseClient.ts`**: Inicializa y exporta una instancia única del cliente de Supabase para ser utilizada en toda la aplicación.
-   **`types.ts`**: Contiene todas las interfaces y tipos compartidos (`AppUser`, `Branch`, `Product`, `Page`, etc.).
-   **`pages/`**: Cada archivo aquí es un componente de "página" que se renderiza en el área de contenido principal. Estas páginas son responsables de obtener sus propios datos y manejar la lógica específica de esa vista.
-   **`components/`**: Contiene componentes de UI "tontos" o reutilizables. Estos componentes reciben datos y funciones a través de `props` y no gestionan su propio estado complejo.

## 4. Gestión del Estado

-   **Estado Global:** El estado de la sesión de autenticación y el perfil del usuario se gestionan en el componente de nivel superior (`App.tsx`) utilizando `useState` y `useEffect`. Se pasan a los componentes hijos a través de props.
-   **Estado Local:** El estado específico de una página (como la lista de sucursales en `BranchesPage.tsx`) o de un componente se gestiona localmente dentro de ese mismo componente.

## 5. Enrutamiento

Se utiliza un sistema de enrutamiento simple basado en el estado, gestionado en `App.tsx`.
-   La variable de estado `currentPage` (`useState<Page>`) determina qué componente de página se renderiza.
-   La función `setCurrentPage` se pasa a los componentes de navegación (como `Sidebar` y `ProfileMenu`) para cambiar la vista actual.

## 6. Guía para Futuro Desarrollo

-   **Para añadir una nueva página (ej. "Ventas"):**
    1.  Crea el archivo `pages/SalesPage.tsx`.
    2.  Añade `'sales'` al tipo `Page` en `types.ts`.
    3.  Añade la lógica de renderizado para `SalesPage` en el `switch` dentro de `App.tsx`.
    4.  Añade el enlace de navegación en `components/Sidebar.tsx`.

-   **Para añadir un nuevo componente reutilizable (ej. un Modal):**
    1.  Crea el archivo `components/Modal.tsx`.
    2.  Impórtalo y úsalo en cualquier página o componente que lo necesite.

-   **Para añadir un nuevo tipo de datos (ej. "Cliente"):**
    1.  Define la interfaz `Client` en `types.ts`.
