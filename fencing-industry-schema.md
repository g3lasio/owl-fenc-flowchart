# Esquema de Industria: Cercas (Fencing)

Este documento define los tipos de cercas, variables críticas y fórmulas base para el cálculo de estimados en la industria de cercas.

## Tipos de Cercas Principales

### 1. Cercas de Vinilo (Vinyl Fencing)
- **Subtipos**: Privacy, Semi-Privacy, Picket, Ranch Rail
- **Materiales principales**: Paneles de vinilo, postes, soportes, tapas
- **Variables críticas**: Longitud, altura, número de puertas, tipo de terreno
- **Datos mínimos requeridos**: Longitud total (pies), altura deseada (pies), cantidad de puertas

### 2. Cercas de Madera (Wood Fencing)
- **Subtipos**: Privacy, Picket, Shadow Box, Board-on-Board, Post-and-Rail
- **Materiales principales**: Tablas, postes, travesaños, herrajes, concreto
- **Variables críticas**: Longitud, altura, tipo de madera, espaciado, tratamiento
- **Datos mínimos requeridos**: Longitud total (pies), altura deseada (pies), tipo de madera

### 3. Cercas de Cadena (Chain Link)
- **Subtipos**: Galvanizado, Recubierto de vinilo, Comercial, Residencial
- **Materiales principales**: Malla, postes, tubos horizontales, tensores, herrajes
- **Variables críticas**: Longitud, altura, calibre, tipo de recubrimiento, tipo de poste
- **Datos mínimos requeridos**: Longitud total (pies), altura (pies), aplicación (residencial/comercial)

### 4. Cercas Ornamentales (Ornamental)
- **Subtipos**: Hierro forjado, Aluminio, Acero
- **Materiales principales**: Paneles, postes, caps, herrajes, concreto
- **Variables críticas**: Longitud, altura, estilo, acabado, espaciado
- **Datos mínimos requeridos**: Longitud total (pies), altura (pies), material (hierro/aluminio/acero)

### 5. Cercas Compuestas (Composite Fencing)
- **Subtipos**: Privacy, Semi-Privacy, Horizontal
- **Materiales principales**: Paneles compuestos, postes, travesaños, herrajes
- **Variables críticas**: Longitud, altura, color, acabado
- **Datos mínimos requeridos**: Longitud total (pies), altura (pies), color deseado

## Estructura del Prompt de IA

Para generar un estimado de cerca usando IA, utilizaremos la siguiente estructura básica de prompt:

```typescript
interface FenceEstimationPrompt {
  // Tipo de cerca
  fenceType: "vinyl" | "wood" | "chain-link" | "ornamental" | "composite";
  fenceSubtype?: string;
  
  // Datos esenciales del proyecto
  dimensions: {
    length: number;       // Longitud total en pies
    height: number;       // Altura en pies
    gates: number;        // Número de puertas (default: 0)
  };
  
  // Información del terreno
  siteInfo?: {
    terrain: "flat" | "sloped" | "complex";
    soilType?: "normal" | "rocky" | "sandy";
    existingFence: boolean;  // ¿Requiere demolición?
  };
  
  // Detalles de materiales
  materialPreferences?: {
    quality: "economy" | "standard" | "premium";
    color?: string;
    features?: string[];  // ["post-caps", "lattice-top", etc]
  };
  
  // Ubicación para ajuste de precios
  location: {
    zipCode: string;
    state?: string;
  };
  
  // Información del contratista
  contractorInfo: {
    name: string;
    preferredMargin?: number;  // Margen de beneficio deseado
  };
}
```

## Algoritmos Básicos para Cálculos de Materiales

### Cercas de Vinilo (Ejemplo)

```typescript
function calculateVinylFencingMaterials(length: number, height: number, gates: number = 0): MaterialsList {
  // Cálculos básicos
  const postSpacing = 8; // pies entre postes
  const postsCount = Math.ceil(length / postSpacing) + 1;
  const panelsCount = Math.ceil(length / postSpacing);
  
  // Lista de materiales
  return {
    materials: [
      {
        category: "Postes",
        items: [
          {
            name: `Poste de vinilo ${height + 2}' para cerca de ${height}'`,
            quantity: postsCount,
            unit: "unidad",
            unitPrice: height <= 6 ? 35 : 45, // Precio base aproximado
          }
        ]
      },
      {
        category: "Paneles",
        items: [
          {
            name: `Panel de vinilo ${height}' x ${postSpacing}'`,
            quantity: panelsCount,
            unit: "unidad",
            unitPrice: height <= 6 ? 120 : 160, // Precio base aproximado
          }
        ]
      },
      {
        category: "Concreto",
        items: [
          {
            name: "Concreto (bolsas 60 lb)",
            quantity: postsCount * 2, // 2 bolsas por poste
            unit: "bolsa",
            unitPrice: 5.5,
          }
        ]
      },
      {
        category: "Puertas",
        items: gates > 0 ? [
          {
            name: `Puerta de vinilo ${height}' x 4'`,
            quantity: gates,
            unit: "unidad",
            unitPrice: height <= 6 ? 250 : 320,
          },
          {
            name: "Kit de hardware para puerta",
            quantity: gates,
            unit: "kit",
            unitPrice: 45,
          }
        ] : []
      }
    ],
    labor: [
      {
        description: "Instalación de cerca de vinilo",
        hours: length / 20, // Aproximadamente 20 pies por día-hombre
        rate: 35, // Tarifa por hora
      },
      {
        description: "Instalación de puertas",
        hours: gates * 2, // 2 horas por puerta
        rate: 40, // Tarifa especializada
      }
    ]
  };
}
```

## Ajustes Regionales y Factores de Complejidad

### Factores Regionales
```typescript
const regionalFactors = {
  // Ejemplos de factores por estado
  "CA": 1.25,  // California: 25% más costoso
  "NY": 1.20,  // Nueva York: 20% más costoso
  "TX": 0.90,  // Texas: 10% más económico
  "FL": 0.95,  // Florida: 5% más económico
  // Valores por defecto
  "DEFAULT": 1.0
};
```

### Factores de Complejidad
```typescript
const complexityFactors = {
  terrain: {
    "flat": 1.0,
    "sloped": 1.15,  // 15% adicional
    "complex": 1.35  // 35% adicional
  },
  soilType: {
    "normal": 1.0,
    "rocky": 1.25,   // 25% adicional
    "sandy": 1.10    // 10% adicional
  },
  demolition: {
    multiplier: 1.20,  // 20% adicional al costo total
    laborHours: (length: number) => length / 30  // Horas adicionales
  }
};
```

## Estructura de Respuesta del LLM

```typescript
interface FenceEstimationResponse {
  // Lista detallada de materiales
  materials: {
    category: string;
    items: {
      name: string;
      description?: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
    }[];
    categoryTotal: number;
  }[];
  
  // Costos de mano de obra
  labor: {
    description: string;
    hours: number;
    rate: number;
    totalCost: number;
  }[];
  
  // Costos adicionales
  additionalCosts: {
    description: string;
    amount: number;
  }[];
  
  // Resumen financiero
  summary: {
    materialCost: number;
    laborCost: number;
    additionalCost: number;
    subtotal: number;
    tax: number;
    total: number;
    profitMargin: number; // Porcentaje
    profitAmount: number; // Monto
  };
  
  // Detalles del proyecto
  projectDetails: {
    scope: string;
    timeframe: string;
    warranty: string;
  };
}
```

## Plantillas de Estimados por Tipo

Para cada tipo de cerca, desarrollaremos plantillas HTML personalizables que resalten las características clave del proyecto. Estas plantillas incluirán:

1. **Encabezado con branding del contratista**
2. **Sección de descripción del proyecto**
3. **Tabla detallada de materiales**
4. **Sección de mano de obra**
5. **Resumen de costos**
6. **Términos y condiciones**
7. **Opciones de aceptación/firma**

## Próximos Pasos para la Implementación

1. Crear el motor de inferencia para cercas de vinilo como primer caso de uso
2. Desarrollar plantillas HTML/PDF para la generación de documentos
3. Implementar el módulo de cálculo de materiales
4. Integrar con el sistema de precios regional
5. Añadir progresivamente los demás tipos de cercas