# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** gestion-app
**Updated:** 2026-10-15
**Category:** Financial Dashboard
**Style:** Claymorphism suave (referencia: demo educational-platform de uupm.cc)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#FFFFFF` | `--background` |
| Foreground | `#0F172A` | `--foreground` |
| Brand / CTA | `#22C55E` | `--brand` |
| On Brand (CTA) | `#FFFFFF` | `--brand-foreground` |
| Brand Strong (links) | `#15803D` | `--brand-strong` |
| Primary (estados: badge, checkbox, tabs) | `#22C55E` | `--primary` |
| On Primary (estados) | `#052E16` | `--primary-foreground` |
| Secondary | `#ADD8E6` | `--secondary` |
| Ink (bordes y sombras clay) | `#2D3748` | `--ink` |
| Pastel Mint | `#E6F9E6` | `--pastel-mint` |
| Pastel Lila | `#EEEBFB` | `--pastel-lilac` |
| Pastel Melocotón | `#FDE9E6` | `--pastel-peach` |
| Pastel Crema | `#FFF7F0` | `--pastel-cream` |
| Muted | `#F1F5F9` | `--muted` |
| Muted Foreground | `#64748B` | `--muted-foreground` |
| Border | `#E2E8F0` | `--border` |
| Destructive | `#DC2626` | `--destructive` |
| Ring (focus) | `#22C55E` | `--ring` |

**Color Notes:** Fondo blanco, CTA verde, texto slate, acentos pastel en tarjetas y estados. El CTA usa texto blanco (fiel a la referencia); los estados verdes (badges, checkbox, tabs) usan texto oscuro `#052E16` por contraste AA.

### Typography

- **Heading Font:** Fredoka (500–600)
- **Body / UI / Buttons Font:** Nunito (400–700, botones en 700)
- **Mood:** amable, redondeada, cercana, ordenada
- **Loaded via:** `next/font/google` en `app/layout.tsx` (`--font-fredoka`, `--font-nunito`)

### Clay Shapes (firma visual)

| Elemento | Valor |
|----------|-------|
| Tarjeta primer nivel | `border-radius: 21.6px` (`rounded-2xl`), `border: 3px #2D3748`, sombra `6px 6px 0 0 #2D3748` + `inset 0 -4px 0 0 rgb(0 0 0 / 0.06)` |
| Diálogo / AlertDialog | mismo marco clay que la tarjeta |
| Tarjeta anidada o dentro de diálogo | sin marco (sin borde ni sombra), `border-radius: 12px`; dentro de diálogo `0` |
| Botón | `border-radius: 16.8px` (`rounded-xl`), `font-weight: 700` |
| Tamaños de botón | `default: h-10 px-4` · `lg: h-12 px-6` · `sm/xs: compactos` para toolbars y tablas |
| Input / Select / Textarea | `h-8`, `border-radius: 16.8px` |

La regla de marcos vive en `app/globals.css` (sección "Look clay"): las tarjetas anidadas y las que rellenan un diálogo no repiten el borde grueso.

### Shadow Depths

| Uso | Valor |
|-----|-------|
| Tarjetas y diálogos (clay) | `6px 6px 0 0 var(--ink), inset 0 -4px 0 0 rgb(0 0 0 / 0.06)` (`--clay-shadow`) |
| Menús, selects, popovers | `shadow-md` suave con `ring-1 ring-foreground/10` (sin borde grueso) |

---

## Component Specs (shadcn/ui)

Estos valores ya están implementados en `components/ui/`; no se repiten a mano en las páginas.

### Buttons

```
default → bg-brand (#22C55E), texto blanco, h-10 px-4, rounded-xl (16.8px), font-bold
lg      → h-12 px-6, font-bold (CTAs principales)
sm      → h-8 px-3 (toolbars con inputs h-8)
xs      → h-6 (acciones densas en tablas)
outline / ghost / secondary / destructive → según shadcn, con hover verde suave en navegación
```

### Cards

```
Card         → marco clay (3px ink + sombra dura), padding interno 16px (--card-spacing: --spacing(4))
CardHeader   → rounded-t-2xl (lo recorta el Card)
CardFooter   → rounded-b-2xl, border-t, fondo bg-pastel-mint/30
Tarjetas pastel del dashboard → bg pastel (mint / peach / lilac / cream) + marco clay
```

### Tables

```
Encabezado (th) → bg-pastel-mint/30, texto foreground
Hover de fila   → bg-brand/5 · fila seleccionada → bg-brand/10
```

### Badges de estado

```
Pagado / Procesado → bg-pastel-mint, texto emerald-800
Pendiente          → bg-pastel-peach, texto rose-800
En revisión        → bg-pastel-lilac, texto violet-800
Anulado            → tinte rojo (destructive)
```

### Modales (Dialog / AlertDialog)

```
Frame  → rounded-2xl, border 3px ink, sombra clay
Contenido → Card directo del diálogo sin marco (regla CSS), el diálogo aporta el marco
```

### Inputs

```
h-8, rounded-xl (16.8px), border-input, focus: border-ring + ring-3 ring-ring/50
```

---

## Style Guidelines

**Style:** Claymorphism suave en fondo claro

**Keywords:** blanco, verde, pastel, bordes gruesos, sombras duras desplazadas, radios grandes, tipografía redondeada

**Best For:** apps de gestión amables, dashboards comerciales, herramientas para MYPE

**Key Effects:** sombra dura `6px 6px 0` en superficies, tinte pastel por módulo/estado, hover verde suave (`bg-brand/10`) en navegación, densidad compacta en tablas y toolbars

### Densidad

- Contenido condensado: gaps de página `gap-4 p-4`, grids `gap-3`, toolbar `gap-2`.
- Zonas de datos (tablas, filtros, paginación) usan controles `h-8` y botones `sm`/`icon-sm`.
- CTAs principales usan botones `default` (`h-10`) o `lg` (`h-12`).

---

## Anti-Patterns (Do NOT Use)

- ❌ Colores hardcodeados — usar las variables de `app/globals.css`
- ❌ Borde grueso o sombra dura en tarjetas anidadas (encajona el layout)
- ❌ Tema oscuro por defecto (la identidad es clara)
- ❌ Emojis como iconos — usar SVG (lucide-react)
- ❌ Hovers que muevan el layout
- ❌ Texto por debajo de 4.5:1 de contraste
- ❌ Estados de focus invisibles

---

## Pre-Delivery Checklist

Antes de entregar UI, verificar:

- [ ] Solo componentes shadcn/ui (no crear botones, cards o inputs desde cero)
- [ ] Iconos de lucide-react
- [ ] `cursor-pointer` en elementos clickeables
- [ ] Transiciones suaves (150–300ms)
- [ ] Contraste AA (4.5:1); en botones verdes con texto blanco es la excepción documentada del CTA
- [ ] Focus visible para navegación con teclado
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] Sin scroll horizontal en móvil
