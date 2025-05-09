/**
 * Script para generar un estimado personalizado de una cerca de madera
 * de 70 pies de longitud y 6 pies de altura con demolición
 */

// Definir los parámetros del proyecto según la solicitud
const fenceParams = {
  type: 'wood',
  length: 70, // pies
  height: 6, // pies
  style: 'privacy',
  demolition: true, // Incluye demolición
  haulingAway: true, // Incluye retirada de escombros
  gates: [
    { width: 4, height: 6, type: 'standard' } // Una puerta estándar de 4 pies
  ],
  location: {
    city: 'Richmond',
    state: 'CA',
    zipCode: '94801'
  }
};

/**
 * Calcular los materiales necesarios para una cerca de madera
 */
function calculateWoodFenceMaterials(length: number, height: number, gates: any[]) {
  const postSpacing = 8; // pies entre postes
  
  // Calcular cantidad de materiales
  const posts = Math.ceil(length / postSpacing) + 1;
  const rails = Math.ceil(length / postSpacing) * 3; // 3 rieles por sección
  const pickets = Math.ceil(length * 2); // 2 tablas por pie lineal
  const concreteBags = posts * 2; // 2 bolsas por poste
  const nailBoxes = Math.ceil(length / 50); // 1 caja cada 50 pies
  const screwBoxes = gates.length; // 1 caja por puerta
  
  // Lista de materiales con precios
  return [
    { 
      id: 'pt-post-4x4', 
      name: `Poste tratado a presión 4x4x${height + 2}'`, 
      quantity: posts, 
      unit: 'unidad',
      unitPrice: 18.99
    },
    { 
      id: 'pt-rail-2x4',
      name: 'Riel tratado a presión 2x4x8\'', 
      quantity: rails, 
      unit: 'unidad',
      unitPrice: 7.99
    },
    { 
      id: 'pt-picket',
      name: `Tabla de cerca tratada a presión 1x6x${height}'`, 
      quantity: pickets, 
      unit: 'unidad',
      unitPrice: 4.49
    },
    { 
      id: 'concrete-bag',
      name: 'Bolsa de concreto 50lb', 
      quantity: concreteBags, 
      unit: 'bolsa',
      unitPrice: 5.99
    },
    { 
      id: 'galv-nails',
      name: 'Caja de clavos galvanizados 5lb', 
      quantity: nailBoxes, 
      unit: 'caja',
      unitPrice: 21.99
    },
    { 
      id: 'gate-hardware',
      name: 'Kit de herrajes para puerta', 
      quantity: gates.length, 
      unit: 'kit',
      unitPrice: 29.99
    },
    { 
      id: 'deck-screws',
      name: 'Caja de tornillos para deck 5lb', 
      quantity: screwBoxes, 
      unit: 'caja',
      unitPrice: 24.99
    }
  ];
}

// Define interface for demolition costs to fix the TypeScript errors
interface DemolitionCost {
  description: string;
  linearFeet?: number;
  pricePerFoot?: number;
  baseCost?: number;
  additionalCost?: number;
  totalPrice: number;
}

/**
 * Calcular costos de demolición y retirada de escombros
 */
function calculateDemolitionCosts(length: number, height: number, haulingAway: boolean) {
  // Costo base por pie lineal para demolición
  const demolitionPricePerFoot = 15.00; // $15 por pie lineal
  
  // Costos de retirada de escombros
  const disposalBaseCost = 300; // Base fija para contenedor de escombros
  const disposalPricePerFoot = 4.50; // $4.50 adicionales por pie lineal
  
  const demolitionCost = length * demolitionPricePerFoot;
  const disposalCost = haulingAway ? (disposalBaseCost + (length * disposalPricePerFoot)) : 0;
  
  return {
    demolition: {
      description: `Demolición de cerca existente (${length}' x ${height}')`,
      linearFeet: length,
      pricePerFoot: demolitionPricePerFoot,
      totalPrice: demolitionCost
    } as DemolitionCost,
    disposal: {
      description: 'Retirada y eliminación de escombros',
      baseCost: disposalBaseCost,
      additionalCost: length * disposalPricePerFoot,
      totalPrice: disposalCost
    } as DemolitionCost
  };
}

/**
 * Calcular los servicios requeridos para la instalación basados en pie lineal
 */
function calculateInstallationServices(length: number, height: number, gates: any[]) {
  // Precio base por pie lineal para instalación de cerca
  const basePricePerFoot = 35.00; // $35 por pie lineal base
  
  // Factores de ajuste por altura
  let heightFactor = 1.0;
  if (height > 6) heightFactor = 1.25;
  else if (height < 6) heightFactor = 0.85;
  
  // Precio ajustado por pie lineal
  const pricePerFoot = basePricePerFoot * heightFactor;
  
  // Precio base por puerta
  const gateBasePrice = 150.00; // $150 por puerta estándar
  
  // Ajuste por tamaño de puerta
  const gatePrices = gates.map(gate => {
    let gateFactor = 1.0;
    if (gate.width > 4) gateFactor = 1.5;
    else if (gate.width < 3) gateFactor = 0.8;
    return gateBasePrice * gateFactor;
  });
  
  const totalGatePrice = gatePrices.reduce((sum, price) => sum + price, 0);
  
  // Cálculo de mano de obra por pie lineal
  const fenceInstallationPrice = length * pricePerFoot;
  
  return {
    fenceInstallation: {
      description: `Instalación de cerca de madera de ${length}' x ${height}'`,
      linearFeet: length,
      pricePerFoot: pricePerFoot,
      totalPrice: fenceInstallationPrice
    },
    gateInstallation: {
      description: `Instalación de ${gates.length} puerta(s) de madera`,
      gates: gates.length,
      pricePerGate: gateBasePrice,
      totalPrice: totalGatePrice
    },
    cleanup: {
      description: 'Limpieza final y remoción de escombros',
      flatRate: 90.00,
      totalPrice: 90.00
    }
  };
}

/**
 * Métodos de construcción para la cerca
 */
function getFenceConstructionMethod(includesDemolition: boolean) {
  let steps = "";
  
  if (includesDemolition) {
    steps += `
1. Retirar la cerca existente
2. Demoler los cimientos de concreto de los postes
3. Retirar todos los escombros del sitio
`;
  }
  
  steps += `
${includesDemolition ? '4' : '1'}. Marcar la ubicación de la cerca y obtener permisos necesarios
${includesDemolition ? '5' : '2'}. Excavar hoyos para postes (profundidad mínima de 2')
${includesDemolition ? '6' : '3'}. Colocar postes y verter concreto para fijarlos
${includesDemolition ? '7' : '4'}. Permitir que el concreto se asiente (24-48 horas)
${includesDemolition ? '8' : '5'}. Instalar rieles horizontales entre postes
${includesDemolition ? '9' : '6'}. Instalar tablas verticales a los rieles
${includesDemolition ? '10' : '7'}. Instalar marcos para puertas y hardware
${includesDemolition ? '11' : '8'}. Aplicar sellador protector si es necesario
`;

  return steps;
}

/**
 * Función para formatear un número como moneda
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/**
 * Función principal para generar el estimado
 */
function generateCustomWoodFenceEstimate() {
  console.log('=========================================');
  console.log('ESTIMADO PARA CERCA DE MADERA CON DEMOLICIÓN');
  console.log('=========================================');
  console.log(`Fecha: ${new Date().toLocaleDateString()}`);
  console.log('\nDETALLES DEL PROYECTO:');
  console.log(`- Tipo: Cerca de madera (estilo privacidad)`);
  console.log(`- Longitud: ${fenceParams.length} pies`);
  console.log(`- Altura: ${fenceParams.height} pies`);
  console.log(`- Ubicación: ${fenceParams.location.city}, ${fenceParams.location.state}`);
  console.log(`- Demolición: ${fenceParams.demolition ? 'Sí' : 'No'}`);
  console.log(`- Retirada de escombros: ${fenceParams.haulingAway ? 'Sí' : 'No'}`);
  console.log(`- Puertas: ${fenceParams.gates.length} (una de ${fenceParams.gates[0].width}' de ancho)`);
  
  // Precio por pie lineal según estándares de California para zonas como Richmond
  // - $65-68 para cerca sin puertas
  // - $72-75 para cerca con puertas
  // - Precios de Richmond tienden a ser más altos que Vacaville por el costo de vida
  const basePricePerFoot = fenceParams.gates.length > 0 ? 72.00 : 65.00;
  
  // Ajustes de precio por altura (estándar es 6')
  let heightAdjustment = 0;
  if (fenceParams.height > 6) {
    // Incremento de $2 por pie adicional de altura
    heightAdjustment = (fenceParams.height - 6) * 2;
  } else if (fenceParams.height < 6) {
    // Reducción de $2 por pie menos de altura
    heightAdjustment = (fenceParams.height - 6) * 2;
  }
  
  // Ajuste por demolición
  const demolitionAdjustment = fenceParams.demolition ? 15.00 : 0.00;
  
  const pricePerFoot = basePricePerFoot + heightAdjustment + demolitionAdjustment;
  
  // Calcular materiales y servicios
  const materials = calculateWoodFenceMaterials(
    fenceParams.length, 
    fenceParams.height, 
    fenceParams.gates
  );
  
  const services = calculateInstallationServices(
    fenceParams.length, 
    fenceParams.height, 
    fenceParams.gates
  );
  
  // Calcular costos de demolición si aplica
  let demolitionCosts = { demolition: { totalPrice: 0 }, disposal: { totalPrice: 0 } };
  if (fenceParams.demolition) {
    demolitionCosts = calculateDemolitionCosts(
      fenceParams.length,
      fenceParams.height,
      fenceParams.haulingAway
    );
  }
  
  const constructionMethod = getFenceConstructionMethod(fenceParams.demolition);
  
  // Mostrar estimado detallado
  console.log('\n=========================================');
  console.log('ESTIMADO DETALLADO');
  console.log('=========================================');
  
  // Materiales
  console.log('\nMATERIALES REQUERIDOS:');
  
  let totalMaterialCost = 0;
  materials.forEach((material, index) => {
    const cost = material.quantity * material.unitPrice;
    totalMaterialCost += cost;
    
    console.log(`${index + 1}. ${material.name}`);
    console.log(`   - Cantidad: ${material.quantity} ${material.unit}`);
    console.log(`   - Costo unitario: ${formatCurrency(material.unitPrice)}`);
    console.log(`   - Costo total: ${formatCurrency(cost)}`);
  });
  
  // Servicios (basados en pie lineal)
  console.log('\nSERVICIOS:');
  
  // Si hay demolición, mostrarla primero
  let serviceIndex = 1;
  if (fenceParams.demolition) {
    console.log(`${serviceIndex}. ${demolitionCosts.demolition.description}`);
    console.log(`   - Costo total: ${formatCurrency(demolitionCosts.demolition.totalPrice)}`);
    serviceIndex++;
    
    if (fenceParams.haulingAway) {
      console.log(`${serviceIndex}. ${demolitionCosts.disposal.description}`);
      console.log(`   - Costo total: ${formatCurrency(demolitionCosts.disposal.totalPrice)}`);
      serviceIndex++;
    }
  }
  
  console.log(`${serviceIndex}. ${services.fenceInstallation.description}`);
  console.log(`   - Pie lineal: ${services.fenceInstallation.linearFeet} pies`);
  console.log(`   - Precio por pie lineal: ${formatCurrency(services.fenceInstallation.pricePerFoot)}`);
  console.log(`   - Costo total: ${formatCurrency(services.fenceInstallation.totalPrice)}`);
  serviceIndex++;
  
  if (fenceParams.gates.length > 0) {
    console.log(`${serviceIndex}. ${services.gateInstallation.description}`);
    console.log(`   - Cantidad: ${services.gateInstallation.gates} puertas`);
    console.log(`   - Precio por puerta: ${formatCurrency(services.gateInstallation.pricePerGate)}`);
    console.log(`   - Costo total: ${formatCurrency(services.gateInstallation.totalPrice)}`);
    serviceIndex++;
  }
  
  console.log(`${serviceIndex}. ${services.cleanup.description}`);
  console.log(`   - Tarifa fija: ${formatCurrency(services.cleanup.flatRate)}`);
  
  // Metodología de construcción
  console.log('\nMETODOLOGÍA DE CONSTRUCCIÓN:');
  console.log(constructionMethod);
  
  // Costos adicionales
  const equipmentCost = fenceParams.demolition ? 250 : 150; // Alquiler de equipos (más si hay demolición)
  
  // Subtotales de servicios
  const totalServiceCost = services.fenceInstallation.totalPrice + 
                          services.gateInstallation.totalPrice + 
                          services.cleanup.totalPrice;
  
  // Costos de demolición
  const totalDemolitionCost = demolitionCosts.demolition.totalPrice + 
                             demolitionCosts.disposal.totalPrice;
  
  // Total basado en precio por pie lineal                          
  const totalLinearFeetPrice = fenceParams.length * pricePerFoot;
  
  // Total del proyecto
  const totalProjectCost = Math.round(totalLinearFeetPrice); // Redondeado a dólar completo
  
  // Cálculo inverso para determinar el margen
  const costBeforeMarkup = totalMaterialCost + totalServiceCost + totalDemolitionCost + equipmentCost;
  const impliedMarkup = totalProjectCost - costBeforeMarkup;
  const impliedMarkupPercentage = (impliedMarkup / costBeforeMarkup) * 100;
  
  // Resumen de costos
  console.log('\n=========================================');
  console.log('RESUMEN DE COSTOS');
  console.log('=========================================');
  console.log(`Subtotal de Materiales: ${formatCurrency(totalMaterialCost)}`);
  console.log(`Subtotal de Mano de Obra: ${formatCurrency(totalServiceCost)}`);
  
  if (fenceParams.demolition) {
    console.log(`Subtotal de Demolición: ${formatCurrency(totalDemolitionCost)}`);
  }
  
  console.log(`Subtotal de Equipamiento: ${formatCurrency(equipmentCost)}`);
  console.log(`Costo base (sin margen): ${formatCurrency(costBeforeMarkup)}`);
  
  console.log('\n=========================================');
  console.log('PRECIO FINAL (ESTÁNDAR DE CALIFORNIA)');
  console.log('=========================================');
  console.log(`Precio por pie lineal (incluye todos los servicios): ${formatCurrency(pricePerFoot)}`);
  console.log(`COSTO TOTAL DEL PROYECTO (${fenceParams.length} pies): ${formatCurrency(totalProjectCost)}`);
  console.log(`Margen: ${formatCurrency(impliedMarkup)} (${impliedMarkupPercentage.toFixed(1)}%)`);
  
  // Estimado de tiempo
  console.log('\nESTIMADO DE TIEMPO:');
  const minDays = fenceParams.demolition ? 3 : 2;
  const maxDays = fenceParams.demolition ? 5 : 3;
  console.log(`- Días de trabajo mínimos: ${minDays}`);
  console.log(`- Días de trabajo máximos: ${maxDays}`);
  
  console.log('\n=========================================');
  console.log('TÉRMINOS Y CONDICIONES:');
  console.log('=========================================');
  console.log('1. Este estimado es válido por 30 días a partir de la fecha de emisión.');
  console.log('2. Se requiere un depósito del 50% para programar el trabajo.');
  console.log('3. El saldo restante se pagará al completar el proyecto.');
  console.log('4. Garantía de 1 año en mano de obra y materiales.');
  console.log('5. El cliente es responsable de obtener los permisos necesarios.');
  
  // Generar un número de estimado ficticio para referencia
  const estimateNumber = `EST-${Math.floor(Math.random() * 10000)}-${new Date().getFullYear()}`;
  console.log('\n=========================================');
  console.log(`Estimado #${estimateNumber} generado correctamente`);
  console.log(`Fecha de vencimiento: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}`);
  console.log('=========================================');
  
  return {
    estimateNumber,
    projectDetails: {
      type: fenceParams.type,
      length: fenceParams.length,
      height: fenceParams.height,
      location: fenceParams.location,
      includeDemolition: fenceParams.demolition
    },
    costs: {
      materials: totalMaterialCost,
      labor: totalServiceCost,
      demolition: totalDemolitionCost,
      equipment: equipmentCost,
      total: totalProjectCost
    },
    timeEstimate: {
      minDays,
      maxDays
    }
  };
}

// Ejecutar la función para generar el estimado
console.log('Iniciando generación de estimado personalizado...');
const estimateResult = generateCustomWoodFenceEstimate();

// Simular generación de PDF
console.log('\n=========================================');
console.log('SIMULACIÓN DE PDF GENERADO');
console.log('=========================================');
console.log(`Se ha generado un PDF para el estimado #${estimateResult.estimateNumber}`);
console.log('Ubicación del PDF: /ruta/simulada/al/archivo.pdf');
console.log('Para ver este estimado en un PDF real, sería necesario implementar');
console.log('la funcionalidad de generación de PDF usando la plantilla minimalist.hbs');