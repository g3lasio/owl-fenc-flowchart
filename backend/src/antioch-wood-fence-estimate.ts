/**
 * Script para generar un estimado de una cerca de madera
 * de 30 pies de longitud y 6 pies de altura en Antioch, CA
 */

// Definir los parámetros del proyecto
const fenceParams = {
    type: 'wood',
    length: 30, // pies
    height: 6, // pies
    style: 'privacy',
    gates: [
        { width: 4, height: 6, type: 'standard' } // Una puerta estándar de 4 pies
    ],
    location: {
        city: 'Antioch',
        state: 'CA',
        zipCode: '94509'
    },
    date: new Date('May 9, 2025')
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
            unitPrice: 19.99
        },
        {
            id: 'pt-rail-2x4',
            name: 'Riel tratado a presión 2x4x8\'',
            quantity: rails,
            unit: 'unidad',
            unitPrice: 8.49
        },
        {
            id: 'pt-picket',
            name: `Tabla de cerca tratada a presión 1x6x${height}'`,
            quantity: pickets,
            unit: 'unidad',
            unitPrice: 4.79
        },
        {
            id: 'concrete-bag',
            name: 'Bolsa de concreto 50lb',
            quantity: concreteBags,
            unit: 'bolsa',
            unitPrice: 6.49
        },
        {
            id: 'galv-nails',
            name: 'Caja de clavos galvanizados 5lb',
            quantity: nailBoxes,
            unit: 'caja',
            unitPrice: 22.99
        },
        {
            id: 'gate-hardware',
            name: 'Kit de herrajes para puerta',
            quantity: gates.length,
            unit: 'kit',
            unitPrice: 32.99
        },
        {
            id: 'deck-screws',
            name: 'Caja de tornillos para deck 5lb',
            quantity: screwBoxes,
            unit: 'caja',
            unitPrice: 26.49
        }
    ];
}

/**
 * Calcular los servicios requeridos para la instalación basados en pie lineal
 */
function calculateInstallationServices(length: number, height: number, gates: any[]) {
    // Precio base por pie lineal para instalación de cerca
    // Antioch tiene precios un poco más altos que otras zonas del Este de la Bahía
    const basePricePerFoot = 38.00; // $38 por pie lineal base

    // Factores de ajuste por altura
    let heightFactor = 1.0;
    if (height > 6) heightFactor = 1.25;
    else if (height < 6) heightFactor = 0.85;

    // Precio ajustado por pie lineal
    const pricePerFoot = basePricePerFoot * heightFactor;

    // Precio base por puerta
    const gateBasePrice = 175.00; // $175 por puerta estándar en Antioch

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
            flatRate: 95.00, // Tarifa en Antioch
            totalPrice: 95.00
        }
    };
}

/**
 * Métodos de construcción para la cerca
 */
function getFenceConstructionMethod() {
    return `
1. Marcar la ubicación de la cerca y obtener permisos necesarios de la ciudad de Antioch
2. Excavar hoyos para postes (profundidad mínima de 2')
3. Colocar postes y verter concreto para fijarlos
4. Permitir que el concreto se asiente (24-48 horas)
5. Instalar rieles horizontales entre postes
6. Instalar tablas verticales a los rieles
7. Instalar marco para puerta y hardware
8. Aplicar sellador protector para extender la vida útil de la madera
`;
}

/**
 * Función para formatear un número como moneda
 */
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

/**
 * Función principal para generar el estimado
 */
function generateWoodFenceEstimate() {
    console.log('=========================================');
    console.log('ESTIMADO PARA CERCA DE MADERA - ANTIOCH, CA');
    console.log('=========================================');
    console.log(`Fecha: ${fenceParams.date.toLocaleDateString()}`);
    console.log('\nDETALLES DEL PROYECTO:');
    console.log(`- Tipo: Cerca de madera (estilo privacidad)`);
    console.log(`- Longitud: ${fenceParams.length} pies lineales`);
    console.log(`- Altura: ${fenceParams.height} pies`);
    console.log(`- Ubicación: ${fenceParams.location.city}, ${fenceParams.location.state}`);
    console.log(`- Puertas: ${fenceParams.gates.length} (${fenceParams.gates[0].width}' de ancho)`);

    // Precio por pie lineal según estándares de California Oriental
    // - $63-65 para cerca sin puertas
    // - $68-70 para cerca con puertas
    const basePricePerFoot = fenceParams.gates.length > 0 ? 68.00 : 63.00;

    // Ajustes de precio por altura (estándar es 6')
    let heightAdjustment = 0;
    if (fenceParams.height > 6) {
        // Incremento de $2 por pie adicional de altura
        heightAdjustment = (fenceParams.height - 6) * 2;
    } else if (fenceParams.height < 6) {
        // Reducción de $2 por pie menos de altura
        heightAdjustment = (fenceParams.height - 6) * 2;
    }

    const pricePerFoot = basePricePerFoot + heightAdjustment;

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

    const constructionMethod = getFenceConstructionMethod();

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
    console.log('\nSERVICIOS DE INSTALACIÓN:');

    console.log(`1. ${services.fenceInstallation.description}`);
    console.log(`   - Pie lineal: ${services.fenceInstallation.linearFeet} pies`);
    console.log(`   - Precio por pie lineal: ${formatCurrency(services.fenceInstallation.pricePerFoot)}`);
    console.log(`   - Costo total: ${formatCurrency(services.fenceInstallation.totalPrice)}`);

    if (fenceParams.gates.length > 0) {
        console.log(`2. ${services.gateInstallation.description}`);
        console.log(`   - Cantidad: ${services.gateInstallation.gates} puertas`);
        console.log(`   - Precio por puerta: ${formatCurrency(services.gateInstallation.pricePerGate)}`);
        console.log(`   - Costo total: ${formatCurrency(services.gateInstallation.totalPrice)}`);
    }

    console.log(`3. ${services.cleanup.description}`);
    console.log(`   - Tarifa fija: ${formatCurrency(services.cleanup.flatRate)}`);

    // Metodología de construcción
    console.log('\nMETODOLOGÍA DE CONSTRUCCIÓN:');
    console.log(constructionMethod);

    // Costos adicionales
    const equipmentCost = 125; // Alquiler de equipos, etc.
    const permitCost = 75; // Permiso en Antioch

    // Subtotales
    const totalServiceCost = services.fenceInstallation.totalPrice +
        services.gateInstallation.totalPrice +
        services.cleanup.totalPrice;

    // Total basado en precio por pie lineal                          
    const totalLinearFeetPrice = fenceParams.length * pricePerFoot;

    // Total del proyecto
    const totalProjectCost = Math.round(totalLinearFeetPrice); // Redondeado a dólar completo

    // Cálculo inverso para determinar el margen
    const costBeforeMarkup = totalMaterialCost + totalServiceCost + equipmentCost + permitCost;
    const impliedMarkup = totalProjectCost - costBeforeMarkup;
    const impliedMarkupPercentage = (impliedMarkup / costBeforeMarkup) * 100;

    // Resumen de costos
    console.log('\n=========================================');
    console.log('RESUMEN DE COSTOS');
    console.log('=========================================');
    console.log(`Subtotal de Materiales: ${formatCurrency(totalMaterialCost)}`);
    console.log(`Subtotal de Mano de Obra: ${formatCurrency(totalServiceCost)}`);
    console.log(`Subtotal de Equipamiento: ${formatCurrency(equipmentCost)}`);
    console.log(`Permisos de construcción: ${formatCurrency(permitCost)}`);
    console.log(`Costo base (sin margen): ${formatCurrency(costBeforeMarkup)}`);

    console.log('\n=========================================');
    console.log('PRECIO FINAL (ESTÁNDAR DE CALIFORNIA)');
    console.log('=========================================');
    console.log(`Precio por pie lineal (${fenceParams.gates.length > 0 ? 'con' : 'sin'} puerta): ${formatCurrency(pricePerFoot)}`);
    console.log(`COSTO TOTAL DEL PROYECTO (${fenceParams.length} pies): ${formatCurrency(totalProjectCost)}`);
    console.log(`Margen: ${formatCurrency(impliedMarkup)} (${impliedMarkupPercentage.toFixed(1)}%)`);

    // Estimado de tiempo
    console.log('\nESTIMADO DE TIEMPO:');
    console.log(`- Días de trabajo mínimos: 1`);
    console.log(`- Días de trabajo máximos: 2`);

    // Garantía y términos
    console.log('\nGARANTÍA Y TÉRMINOS:');
    console.log('- Garantía de 1 año en mano de obra');
    console.log('- Garantía del fabricante en materiales');
    console.log('- Se requiere un depósito del 50% para iniciar el trabajo');
    console.log('- Saldo restante a pagar al completar el proyecto');

    // Número de estimado
    const estimateNumber = `EST-${Math.floor(Math.random() * 10000)}-2025`;
    console.log('\n=========================================');
    console.log(`Estimado #${estimateNumber} generado el ${fenceParams.date.toLocaleDateString()}`);
    console.log(`Válido hasta: ${new Date(fenceParams.date.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}`);
    console.log('=========================================');

    return {
        estimateNumber,
        totalCost: totalProjectCost,
        pricePerFoot
    };
}

// Ejecutar la función para generar el estimado
console.log('Generando estimado para proyecto en Antioch...');
const result = generateWoodFenceEstimate();

// Exportar resultado para uso en API si es necesario
export default result;