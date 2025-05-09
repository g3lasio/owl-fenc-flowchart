/**
 * Script simplificado para generar un estimado de una cerca de madera
 * de 70 pies lineales con demolición en Richmond, California
 */

// Calcular materiales
function calculateMaterials() {
  const length = 70; // pies lineales
  const height = 6; // altura en pies
  const postSpacing = 8; // pies entre postes
  
  // Calcular cantidades
  const posts = Math.ceil(length / postSpacing) + 1; // postes
  const rails = Math.ceil(length / postSpacing) * 3; // 3 rieles por sección
  const pickets = Math.ceil(length * 2); // 2 tablas por pie lineal
  const concrete = posts * 2; // 2 bolsas por poste
  const nails = Math.ceil(length / 50); // 1 caja cada 50 pies
  const gates = 1; // Una puerta estándar
  
  // Lista de materiales con precios
  return [
    { name: `Postes 4x4x8' tratados a presión`, quantity: posts, price: 18.99 },
    { name: `Rieles 2x4x8' tratados a presión`, quantity: rails, price: 7.99 },
    { name: `Tablas 1x6x6' tratadas a presión`, quantity: pickets, price: 4.49 },
    { name: `Bolsas de concreto de 50lb`, quantity: concrete, price: 5.99 },
    { name: `Cajas de clavos galvanizados`, quantity: nails, price: 21.99 },
    { name: `Kit de herrajes para puerta`, quantity: gates, price: 29.99 },
    { name: `Tornillos para exterior`, quantity: gates, price: 24.99 }
  ];
}

// Calcular servicios
function calculateServices() {
  const length = 70; // pies lineales
  const height = 6; // altura en pies
  
  // Precios base
  const installationPrice = 35.00 * length; // $35 por pie lineal
  const gatePrice = 150.00; // $150 por puerta estándar
  const cleanupPrice = 90.00; // Tarifa fija
  const demolitionPrice = 15.00 * length; // $15 por pie lineal
  const disposalPrice = 300.00 + (4.50 * length); // Base + $4.50 por pie
  
  return [
    { name: `Demolición de cerca existente (${length} pies)`, price: demolitionPrice },
    { name: `Retirada y eliminación de escombros`, price: disposalPrice },
    { name: `Instalación de cerca de madera ${length}' x ${height}'`, price: installationPrice },
    { name: `Instalación de puerta de madera 4' x 6'`, price: gatePrice },
    { name: `Limpieza final`, price: cleanupPrice }
  ];
}

// Generar estimado completo
function generateEstimate() {
  console.log('=========================================');
  console.log('ESTIMADO PARA CERCA DE MADERA CON DEMOLICIÓN');
  console.log('=========================================');
  console.log(`Fecha: ${new Date().toLocaleDateString()}`);
  
  console.log('\nDETALLES DEL PROYECTO:');
  console.log('- Tipo: Cerca de madera (estilo privacidad)');
  console.log('- Longitud: 70 pies lineales');
  console.log('- Altura: 6 pies');
  console.log('- Ubicación: Richmond, California');
  console.log('- Incluye: Demolición y retirada de cerca existente');
  console.log('- Puertas: 1 puerta estándar de 4 pies');
  
  // Calcular materiales
  const materials = calculateMaterials();
  let materialTotal = 0;
  
  console.log('\nMATERIALES:');
  materials.forEach((item, index) => {
    const total = item.quantity * item.price;
    materialTotal += total;
    console.log(`${index + 1}. ${item.name}`);
    console.log(`   Cantidad: ${item.quantity}`);
    console.log(`   Precio unitario: $${item.price.toFixed(2)}`);
    console.log(`   Subtotal: $${total.toFixed(2)}`);
  });
  
  // Calcular servicios
  const services = calculateServices();
  let serviceTotal = 0;
  
  console.log('\nSERVICIOS:');
  services.forEach((item, index) => {
    serviceTotal += item.price;
    console.log(`${index + 1}. ${item.name}`);
    console.log(`   Precio: $${item.price.toFixed(2)}`);
  });
  
  // Calcular costos adicionales
  const equipmentCost = 250; // Alquiler de equipos
  
  // Calcular precio final
  const subtotal = materialTotal + serviceTotal + equipmentCost;
  const margin = 0.25; // 25% margen
  const markupAmount = subtotal * margin;
  const total = subtotal + markupAmount;
  
  // Precio por pie lineal (método alternativo de cálculo)
  const pricePerFoot = 87.00; // $87 por pie con demolición, puerta e instalación
  const totalByFootage = 70 * pricePerFoot;
  
  console.log('\nRESUMEN DE COSTOS:');
  console.log(`Materiales: $${materialTotal.toFixed(2)}`);
  console.log(`Mano de obra y servicios: $${serviceTotal.toFixed(2)}`);
  console.log(`Equipamiento: $${equipmentCost.toFixed(2)}`);
  console.log(`Subtotal: $${subtotal.toFixed(2)}`);
  console.log(`Margen (25%): $${markupAmount.toFixed(2)}`);
  console.log(`TOTAL FINAL: $${total.toFixed(2)}`);
  
  console.log('\nCÁLCULO ALTERNATIVO (por pie lineal):');
  console.log(`Precio por pie lineal: $${pricePerFoot.toFixed(2)}`);
  console.log(`TOTAL (70 pies): $${totalByFootage.toFixed(2)}`);
  
  console.log('\nESTIMADO DE TIEMPO:');
  console.log('- Días de trabajo estimados: 3-5 días');
  
  console.log('\nMETODOLOGÍA:');
  console.log('1. Retirar la cerca existente');
  console.log('2. Demoler los cimientos de concreto de los postes');
  console.log('3. Retirar todos los escombros del sitio');
  console.log('4. Marcar la ubicación de la nueva cerca');
  console.log('5. Excavar hoyos para postes (profundidad mínima de 2 pies)');
  console.log('6. Colocar postes y verter concreto para fijarlos');
  console.log('7. Permitir que el concreto se asiente (24-48 horas)');
  console.log('8. Instalar rieles horizontales entre postes');
  console.log('9. Instalar tablas verticales a los rieles');
  console.log('10. Instalar marco para puerta y herrajes');
  console.log('11. Aplicar sellador protector (opcional)');
  
  // Generar número de estimado
  const estimateNumber = `EST-${Math.floor(Math.random() * 10000)}-2025`;
  
  console.log('\n=========================================');
  console.log(`Estimado #${estimateNumber} generado correctamente`);
  console.log(`Fecha de vencimiento: ${new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString()}`);
  console.log('=========================================');
  
  return {
    estimateNumber,
    total,
    totalByFootage
  };
}

// Ejecutar el estimado
console.log('Generando estimado personalizado...');
const result = generateEstimate();

// Simular generación de PDF
console.log('\nSIMULACIÓN DE PDF:');
console.log(`Se ha generado un PDF para el estimado #${result.estimateNumber}`);
console.log('Ubicación: /samples_estimates/richmond_fence_estimate.pdf');
console.log('Para un PDF real, se utilizaría la plantilla minimalist.hbs');