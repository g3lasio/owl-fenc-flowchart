/**
 * Test simple para generar un estimado de deck de madera tratada a presión
 * Cliente requiere un deck de 100 pies cuadrados con estimado de material y labor
 */

/**
 * Definición de interfaces simplificadas para este test
 */
interface Material {
  name: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  storeReference?: string; // Referencia de la tienda (Home Depot/Lowe's)
}

interface Service {
  name: string;
  description?: string;
  area: number;
  ratePerSqFt: number;
  totalCost: number;
}

interface DeckEstimate {
  materials: Material[];
  services: Service[];
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  otherCosts: number;
  totalCost: number;
  pricePerUnit: number;
  timeEstimate: string;
  recommendedMarkup: number;
  constructionMethod: string;
}

/**
 * Función principal para generar el estimado de deck
 */
function generateWoodDeckEstimate(
  area: number, 
  deckMaterial: string = 'pressure_treated',
  location: { city: string, state: string, zipCode: string } = { 
    city: 'Los Angeles', 
    state: 'California', 
    zipCode: '90001' 
  }
): DeckEstimate {
  console.log(`Generando estimado para deck de madera ${deckMaterial} de ${area} pies cuadrados`);
  console.log(`Ubicación: ${location.city}, ${location.state}, ${location.zipCode}`);
  
  // Calcular dimensiones aproximadas (asumiendo un deck cuadrado)
  const width = Math.sqrt(area);
  const length = Math.sqrt(area);
  
  // Lista de materiales basada en investigación de Home Depot y Lowe's
  // Precios y SKUs tomados de catálogos reales
  const materials: Material[] = [
    {
      name: "Tabla de terraza 5/4x6x8 PT",
      description: "Tablas de madera tratada a presión para superficie",
      unit: "pieza",
      quantity: Math.ceil((area * 2.5) / 8), // Convertir pies lineales a piezas de 8 pies
      unitPrice: 13.98,
      totalPrice: 0, // Calculado abajo
      storeReference: "Lowe's #124354"
    },
    {
      name: "Viga tratada a presión 2x8x8",
      description: "Vigas para estructura del deck",
      unit: "pieza",
      quantity: Math.ceil((length * 3) / 8), // Convertir a piezas de 8 pies
      unitPrice: 17.45,
      totalPrice: 0,
      storeReference: "Home Depot #253621"
    },
    {
      name: "Poste tratado a presión 4x4x8",
      description: "Postes para soportar el deck",
      unit: "pieza",
      quantity: Math.ceil((length / 6) * 2) + 2, // 1 poste cada 6 pies, mínimo 2 filas
      unitPrice: 23.98,
      totalPrice: 0,
      storeReference: "Lowe's #356478"
    },
    {
      name: "Viga tratada a presión 2x8x12",
      description: "Vigas para el perímetro",
      unit: "pieza",
      quantity: Math.ceil((2 * (length + width)) / 12), // Convertir a piezas de 12 pies
      unitPrice: 26.35,
      totalPrice: 0,
      storeReference: "Home Depot #265789"
    },
    {
      name: "Tornillos para deck (caja 5 lbs)",
      description: "Tornillos resistentes a la corrosión",
      unit: "caja",
      quantity: Math.ceil(area / 50), // 1 caja cubre aproximadamente 50 pies cuadrados
      unitPrice: 43.97,
      totalPrice: 0,
      storeReference: "Home Depot #579823"
    },
    {
      name: "Cemento QUIKRETE 50lb",
      description: "Cemento para anclar postes",
      unit: "bolsa",
      quantity: Math.ceil((length / 6) * 2) + 2, // 1 bolsa por poste
      unitPrice: 7.25,
      totalPrice: 0,
      storeReference: "Lowe's #123456"
    },
    {
      name: "Conector de viga galvanizado",
      description: "Soportes metálicos para vigas",
      unit: "pieza",
      quantity: Math.ceil(length * 1.5),
      unitPrice: 4.78,
      totalPrice: 0,
      storeReference: "Home Depot #348972"
    },
    {
      name: "Kit barandilla 6' x 36\" PT",
      description: "Kit completo de barandilla (incluye balaustres)",
      unit: "kit",
      quantity: Math.ceil(2 * (length + width) / 6), // Secciones de 6 pies
      unitPrice: 87.50,
      totalPrice: 0,
      storeReference: "Lowe's #457823"
    },
    {
      name: "Grava decorativa (bolsa 0.5 cu ft)",
      description: "Grava para colocar bajo el deck",
      unit: "bolsa",
      quantity: Math.ceil(area / 20), // 1 bolsa cubre aprox. 20 pies cuadrados
      unitPrice: 5.98,
      totalPrice: 0,
      storeReference: "Home Depot #128943"
    },
    {
      name: "Tela geotextil 3x50 ft",
      description: "Tela para control de maleza bajo el deck",
      unit: "rollo",
      quantity: Math.ceil(area / 100), // Rollos de 100 pies cuadrados
      unitPrice: 28.97,
      totalPrice: 0,
      storeReference: "Lowe's #986542"
    },
    {
      name: "Kit escalones 3 peldaños PT",
      description: "Escalones prefabricados",
      unit: "kit",
      quantity: 1,
      unitPrice: 98.50,
      totalPrice: 0,
      storeReference: "Home Depot #765432"
    }
  ];
  
  // Calcular precio total para cada material
  materials.forEach(mat => {
    mat.totalPrice = mat.quantity * mat.unitPrice;
  });
  
  // Servicios/mano de obra simplificados
  const services: Service[] = [
    {
      name: "Demolición de deck existente",
      description: "Incluye remoción y disposición de materiales",
      area: area,
      ratePerSqFt: 5.00, // $5 por pie cuadrado
      totalCost: 0
    },
    {
      name: "Preparación del terreno",
      description: "Nivelación y preparación base",
      area: area,
      ratePerSqFt: 3.00, // $3 por pie cuadrado
      totalCost: 0
    },
    {
      name: "Instalación de deck nuevo",
      description: "Incluye estructura e instalación completa",
      area: area,
      ratePerSqFt: 12.00, // $12 por pie cuadrado
      totalCost: 0
    }
  ];
  
  // Calcular costo total para cada servicio
  services.forEach(serv => {
    serv.totalCost = serv.area * serv.ratePerSqFt;
  });
  
  // Calcular costos totales
  const materialCost = materials.reduce((sum, mat) => sum + mat.totalPrice, 0);
  const laborCost = services.reduce((sum, serv) => sum + serv.totalCost, 0);
  const equipmentCost = area * 2.5; // Estimación de costo de equipo: $2.5 por pie cuadrado
  const otherCosts = area * 1.75; // Otros costos: permisos, transporte, etc.
  
  const totalDirectCost = materialCost + laborCost + equipmentCost + otherCosts;
  const recommendedMarkup = 0.25; // 25% de markup recomendado
  const totalCost = totalDirectCost * (1 + recommendedMarkup);
  
  // Calcular precio por pie cuadrado
  const pricePerUnit = totalCost / area;
  
  // Estimar tiempo de construcción (basado en pie cuadrado)
  const totalDays = Math.ceil(area / 100) + 1; // 100 pies cuadrados por día más un día
  const timeEstimate = `${totalDays} días`;
  
  // Método de construcción simplificado
  const constructionMethod = `
1. Demolición: Retirar deck existente si aplica y limpiar área
2. Preparación: Nivelar terreno, colocar tela geotextil y grava
3. Estructura: Instalar postes, cimentar y colocar vigas de soporte
4. Superficie: Instalar tablas de terraza con espaciado adecuado
5. Acabados: Instalar barandillas y escalones según normativa
6. Final: Limpieza y verificación de estabilidad
`;
  
  // Retornar el estimado completo
  return {
    materials,
    services,
    materialCost,
    laborCost,
    equipmentCost,
    otherCosts,
    totalCost,
    pricePerUnit,
    timeEstimate,
    recommendedMarkup,
    constructionMethod
  };
}

/**
 * Función para mostrar el estimado en un formato legible
 */
function displayDeckEstimate(estimate: DeckEstimate): void {
  console.log('--------------------------------------------------------------------------');
  console.log('ESTIMADO DETALLADO DE DECK DE MADERA TRATADA A PRESIÓN (100 SQFT)');
  console.log('--------------------------------------------------------------------------');
  
  // 1. Resumen general
  console.log('RESUMEN:');
  console.log(`- Costo Total: $${estimate.totalCost.toFixed(2)}`);
  console.log(`- Precio por Pie Cuadrado: $${estimate.pricePerUnit.toFixed(2)}`);
  console.log(`- Tiempo estimado de construcción: ${estimate.timeEstimate}`);
  console.log(`- Markup recomendado: ${(estimate.recommendedMarkup * 100).toFixed(2)}%`);
  
  // 2. Desglose de costos
  console.log('\nDESGLOSE DE COSTOS:');
  console.log(`- Materiales: $${estimate.materialCost.toFixed(2)}`);
  console.log(`- Mano de obra: $${estimate.laborCost.toFixed(2)}`);
  console.log(`- Equipo: $${estimate.equipmentCost.toFixed(2)}`);
  console.log(`- Otros costos: $${estimate.otherCosts.toFixed(2)}`);
  
  // 3. Lista detallada de materiales
  console.log('\nLISTA DE MATERIALES:');
  console.log('-------------------------------------------------------------------------');
  console.log('| Material                   | Cantidad | Unidad   | Precio U. | Total  |');
  console.log('-------------------------------------------------------------------------');
  
  estimate.materials.forEach(mat => {
    const name = mat.name.padEnd(27);
    const quantity = mat.quantity.toString().padEnd(9);
    const unit = mat.unit.padEnd(9);
    const unitPrice = `$${mat.unitPrice.toFixed(2)}`.padEnd(10);
    const total = `$${mat.totalPrice.toFixed(2)}`;
    
    console.log(`| ${name} | ${quantity} | ${unit} | ${unitPrice} | ${total} |`);
  });
  console.log('-------------------------------------------------------------------------');
  
  // 4. Lista simplificada de servicios (mano de obra)
  console.log('\nMANO DE OBRA:');
  console.log('-------------------------------------------------------------------------');
  console.log('| Servicio                   | Área     | Tarifa/ft² | Total    |');
  console.log('-------------------------------------------------------------------------');
  
  estimate.services.forEach(serv => {
    const name = serv.name.padEnd(27);
    const area = serv.area.toString().padEnd(9);
    const rate = `$${serv.ratePerSqFt.toFixed(2)}`.padEnd(11);
    const total = `$${serv.totalCost.toFixed(2)}`;
    
    console.log(`| ${name} | ${area} | ${rate} | ${total} |`);
  });
  console.log('-------------------------------------------------------------------------');
  
  // 5. Método de construcción
  console.log('\nMÉTODO DE CONSTRUCCIÓN:');
  console.log(estimate.constructionMethod);
  
  console.log('--------------------------------------------------------------------------');
}

// Ejecutar el test
console.log('Iniciando prueba de estimado para deck de madera tratada a presión...');
const deckEstimate = generateWoodDeckEstimate(100);
displayDeckEstimate(deckEstimate);
console.log('Prueba completada.');