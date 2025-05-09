import { expect } from 'chai';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import { UnstructuredInputEngine } from '../../../src/engines/unstructured-input.engine';
import { OpenAIClient } from '../../../src/services/openai.client';
import { AnthropicClient } from '../../../src/services/anthropic.client';
import { MaterialSupplierService } from '../../../src/services/material-supplier.service';
import { ProjectImage } from '../../../src/interfaces/flow-manager.interfaces';
import { Location } from '../../../src/interfaces/fence.interfaces';

describe('UnstructuredInputEngine', () => {
  let engine: UnstructuredInputEngine;
  let openAIClientStub: sinon.SinonStubbedInstance<OpenAIClient>;
  let anthropicClientStub: sinon.SinonStubbedInstance<AnthropicClient>;
  let materialSupplierServiceStub: sinon.SinonStubbedInstance<MaterialSupplierService>;
  let fsReadFileSyncStub: sinon.SinonStub;
  
  // Valores de muestra para pruebas - actualizados para coincidir con la interfaz real
  const sampleLocation: Location = {
    zipCode: '12345',
    city: 'TestCity',
    state: 'TestState',
    country: 'US',
    timezone: 'America/New_York'
  };
  
  // Datos de prueba para imágenes - actualizados para coincidir con la interfaz real
  const createTestImages = (count: number, valid: boolean = true): ProjectImage[] => {
    return Array.from({ length: count }).map((_, index) => ({
      id: `image-${index}`,
      url: valid ? `/fake/path/image${index}.jpg` : '',
      type: 'site',
      notes: 'Test image',
      path: `/fake/path/image${index}.jpg`, // Propiedad adicional no en la interfaz pero necesaria para el test
      mimeType: valid ? 'image/jpeg' : 'application/pdf', // Propiedad adicional no en la interfaz pero necesaria para el test
      data: valid ? 'base64encodedimagedata' : null // Propiedad adicional no en la interfaz pero necesaria para el test
    })) as any; // Usar any para permitir propiedades adicionales
  };
  
  // Mock para análisis de imágenes
  const mockImageAnalysis = (isValid: boolean = true, type: string = 'fencing') => {
    return {
      projectType: isValid ? type : undefined,
      materials: isValid ? { 
        'wood': 'pressure treated pine',
        'posts': '4x4 posts' 
      } : {},
      dimensions: isValid ? { 
        length: '100 feet', 
        height: '6 feet' 
      } : {},
      conditions: isValid ? {
        'terrain': 'flat',
        'soilType': 'clay'
      } : {}
    };
  };
  
  // Mock para análisis de notas
  const mockNotesAnalysis = (isValid: boolean = true, type: string = 'fencing', contradictDimensions: boolean = false) => {
    return {
      projectType: isValid ? type : undefined,
      projectSubtype: isValid ? 'wood' : undefined,
      dimensions: isValid ? {
        length: contradictDimensions ? '50 feet' : '100 feet',
        height: '8 feet'
      } : {},
      materialRequirements: isValid ? {
        'woodType': 'cedar',
        'postType': '6x6 posts'
      } : {},
      specialConsiderations: isValid ? ['Steep slope at north end', 'Gate needs to be wide enough for riding mower'] : [],
      demolitionNeeded: isValid ? true : false,
      clientPreferences: isValid ? {
        'style': 'traditional picket fence',
        'color': 'natural wood'
      } : {}
    };
  };
  
  beforeEach(() => {
    // Create stubs for all dependencies
    openAIClientStub = sinon.createStubInstance(OpenAIClient);
    anthropicClientStub = sinon.createStubInstance(AnthropicClient);
    materialSupplierServiceStub = sinon.createStubInstance(MaterialSupplierService);
    fsReadFileSyncStub = sinon.stub(fs, 'readFileSync');
    
    // Configure default stub behaviors
    fsReadFileSyncStub.returns(Buffer.from('fake-image-data'));
    
    // Stub los métodos específicos - Corregido según las interfaces reales
    openAIClientStub.complete.callsFake(async (params) => {
      // Simular diferentes respuestas basadas en el prompt
      if (params.prompt.includes('ventana') || params.prompt.includes('window')) {
        return JSON.stringify(mockImageAnalysis(true, 'window replacement'));
      }
      return JSON.stringify(mockImageAnalysis(true, 'fencing'));
    });
    
    anthropicClientStub.complete.resolves(JSON.stringify(mockNotesAnalysis(true, 'fencing')));
    
    materialSupplierServiceStub.checkInventoryAvailability.resolves({
      available: true,
      suppliers: [{ name: 'Test Supplier', distance: 5.2 }]
    });
    
    materialSupplierServiceStub.getRecommendedProducts.resolves([
      { id: 'prod1', name: 'Cedar Pickets', price: 12.99, recommendedQuantity: 80 }
    ]);
    
    // Create the engine with stubbed dependencies
    engine = new UnstructuredInputEngine(
      openAIClientStub as unknown as OpenAIClient,
      anthropicClientStub as unknown as AnthropicClient,
      materialSupplierServiceStub as unknown as MaterialSupplierService
    );
  });
  
  afterEach(() => {
    // Restore all stubs
    sinon.restore();
  });
  
  describe('processUnstructuredInput', () => {
    /**
     * Escenario 1: Caso exitoso con datos completos y coherentes
     * - Imágenes válidas
     * - Notas detalladas y coherentes con las imágenes
     * - Todos los servicios externos funcionan correctamente
     */
    it('debería procesar correctamente input completo para un proyecto de cerca', async () => {
      // Arreglar
      const testImages = createTestImages(3, true);
      const testNotes = "Necesito una cerca de madera de 100 pies de largo y 6 pies de alto. Quiero utilizar madera de cedro y postes de 6x6. El terreno es plano pero hay una pendiente en el extremo norte. Necesito una puerta lo suficientemente ancha para un cortacésped.";
      
      // Actuar
      const result = await engine.processUnstructuredInput(testImages, testNotes, sampleLocation);
      
      // Aseverar
      expect(result).to.have.property('projectType', 'fencing');
      expect(result).to.have.property('projectSubtype', 'wood');
      expect(result.dimensions).to.have.property('length', 100);
      expect(result.dimensions).to.have.property('height', 8); // Toma altura de las notas (8) no de las imágenes (6)
      expect(result.options).to.have.property('demolitionNeeded', true);
      expect(result.options.materials).to.have.property('woodType', 'cedar');
      expect(result.detectedElements.specialConsiderations).to.include('Steep slope at north end');
      
      // Verificar que todos los métodos fueron llamados con los parámetros correctos
      expect(openAIClientStub.complete.callCount).to.be.at.least(3); // Al menos una vez por imagen
      expect(anthropicClientStub.complete.calledOnce).to.be.true;
      expect(fsReadFileSyncStub.callCount).to.be.at.least(3);
    });
    
    /**
     * Escenario 2: Caso con imágenes inválidas pero notas detalladas
     * - Imágenes no soportadas o corruptas
     * - Notas detalladas que pueden compensar la falta de información de imágenes
     */
    it('debería procesar correctamente cuando las imágenes son inválidas pero las notas son detalladas', async () => {
      // Arreglar
      const invalidImages = createTestImages(2, false); // Imágenes inválidas
      const validNotes = "Necesito una cerca de madera de 100 pies de largo y 6 pies de alto con estilo de privacidad. Debe ser de cedro con postes de 6x6. El terreno tiene una ligera pendiente.";
      
      // Configurar stubs para simular errores en el procesamiento de imágenes
      fsReadFileSyncStub.throws(new Error('Error al leer la imagen'));
      openAIClientStub.complete.onFirstCall().rejects(new Error('Error procesando imagen'));
      anthropicClientStub.complete.resolves(JSON.stringify(mockNotesAnalysis(true, 'fencing')));
      
      // Actuar
      const result = await engine.processUnstructuredInput(invalidImages, validNotes, sampleLocation);
      
      // Aseverar
      expect(result).to.have.property('projectType', 'fencing');
      expect(result.dimensions).to.have.property('length', 100);
      expect(result.dimensions).to.have.property('height', 8);
      expect(result.options.materials).to.have.property('woodType', 'cedar');
      
      // Verificar que el sistema intentó procesar las imágenes pero falló
      expect(openAIClientStub.complete.called).to.be.true;
      expect(anthropicClientStub.complete.calledOnce).to.be.true;
    });
    
    /**
     * Escenario 3: Caso con imágenes válidas pero sin notas
     * - Imágenes claras y procesables
     * - Sin notas del contratista
     */
    it('debería procesar correctamente cuando hay imágenes válidas pero no hay notas', async () => {
      // Arreglar
      const validImages = createTestImages(2, true);
      const emptyNotes = "";
      
      // Configurar stubs
      anthropicClientStub.complete.resolves('{"isEmpty": true}');
      
      // Actuar
      const result = await engine.processUnstructuredInput(validImages, emptyNotes, sampleLocation);
      
      // Aseverar
      expect(result).to.have.property('projectType', 'fencing');
      expect(result.dimensions).to.have.property('length');
      expect(result.dimensions).to.have.property('height');
      
      // Las dimensiones deben provenir completamente de las imágenes
      expect(result.options).to.not.have.property('clientPreferences');
      expect(openAIClientStub.complete.callCount).to.be.at.least(2);
    });
    
    /**
     * Escenario 4: Caso con información contradictoria
     * - Información diferente en imágenes y notas
     * - El sistema debe resolver conflictos priorizando las notas
     */
    it('debería resolver correctamente contradicciones entre imágenes y notas', async () => {
      // Arreglar
      const validImages = createTestImages(1, true);
      const contradictoryNotes = "Necesito una cerca de 50 pies de largo y 8 pies de alto. Material: cedro.";
      
      // Configurar stubs con información contradictoria
      anthropicClientStub.complete.resolves(JSON.stringify(mockNotesAnalysis(true, 'fencing', true))); // 50 feet en las notas
      
      // Actuar
      const result = await engine.processUnstructuredInput(validImages, contradictoryNotes, sampleLocation);
      
      // Aseverar - las notas deben tener prioridad
      expect(result).to.have.property('projectType', 'fencing');
      expect(result.dimensions).to.have.property('length', 50); // Debe tomar el valor de las notas (50), no de las imágenes (100)
      expect(result.dimensions).to.have.property('height', 8);
    });
    
    /**
     * Escenario 5: Caso con proyecto no reconocido que requiere inferencia
     * - El tipo de proyecto no está claramente identificado
     * - El sistema debe hacer su mejor esfuerzo para inferir el tipo
     */
    it('debería inferir correctamente el tipo de proyecto cuando no está claramente especificado', async () => {
      // Arreglar
      const validImages = createTestImages(1, true);
      const vagueNotes = "Necesito una barrera en mi propiedad para tener privacidad de mis vecinos. Preferiblemente de material duradero.";
      
      // Configurar stubs con información vaga
      openAIClientStub.complete.onFirstCall().resolves(JSON.stringify(mockImageAnalysis(true, 'barrier'))); // Tipo no estándar
      anthropicClientStub.complete.resolves(JSON.stringify({
        projectType: 'barrera de privacidad',
        dimensions: { length: '75 feet', height: '6 feet' }
      }));
      openAIClientStub.complete.onSecondCall().resolves('fencing'); // Inferencia del tipo de proyecto
      
      // Actuar
      const result = await engine.processUnstructuredInput(validImages, vagueNotes, sampleLocation);
      
      // Aseverar
      expect(result).to.have.property('projectType', 'fencing'); // Debe inferir que es una cerca
      expect(result.dimensions).to.exist;
    });
    
    /**
     * Escenario 6: Caso con fallo total en servicios externos
     * - APIs externas no disponibles o con error
     * - El sistema debe manejar graciosamente los errores
     */
    it('debería manejar apropiadamente fallos completos en servicios externos', async () => {
      // Arreglar
      const validImages = createTestImages(1, true);
      const simpleNotes = "Cerca de madera";
      
      // Configurar stubs para simular fallos en todas las APIs
      openAIClientStub.complete.rejects(new Error('API no disponible'));
      anthropicClientStub.complete.rejects(new Error('Servicio no disponible'));
      
      // Actuar y aseverar
      try {
        await engine.processUnstructuredInput(validImages, simpleNotes, sampleLocation);
        expect.fail('Debería haber lanzado una excepción');
      } catch (error) {
        expect(error).to.be.an('Error');
        const errorObj = error as Error; // Casting de tipo para acceder a la propiedad message
        expect(errorObj.message).to.include('Error procesando imágenes y notas');
      }
    });
    
    /**
     * Escenario 7: Caso específico para proyectos de ventanas
     * - Proyecto de reemplazo de ventanas
     * - Prueba la lógica especializada para ventanas
     */
    it('debería activar análisis especializado para proyectos de ventanas', async () => {
      // Arreglar
      const windowImages = createTestImages(2, true);
      const windowNotes = "Necesito reemplazar 3 ventanas en mi casa. Prefiero ventanas de vinilo de doble panel.";
      
      // Configurar stubs para proyecto de ventanas
      openAIClientStub.complete.onFirstCall().resolves(JSON.stringify(mockImageAnalysis(true, 'window replacement')));
      anthropicClientStub.complete.resolves(JSON.stringify(mockNotesAnalysis(true, 'window_replacement')));
      
      // Mock para el análisis específico de ventanas
      const windowAnalysisResult = JSON.stringify({
        windows: [
          {
            dimensions: { width: 36, height: 60 },
            type: 'double-hung',
            material: 'vinyl',
            glass: 'double-pane'
          }
        ]
      });
      openAIClientStub.complete.onSecondCall().resolves(windowAnalysisResult);
      
      materialSupplierServiceStub.checkInventoryAvailability.resolves({
        available: true,
        suppliers: [{ name: 'Window World', distance: 12.5 }]
      });
      materialSupplierServiceStub.getRecommendedProducts.resolves([
        { id: 'win1', name: 'Premium Double-Hung Vinyl Window', price: 299.99, recommendedQuantity: 3 }
      ]);
      
      // Actuar
      const result = await engine.processUnstructuredInput(windowImages, windowNotes, sampleLocation);
      
      // Aseverar
      expect(result).to.have.property('projectType', 'window_replacement');
      expect(result).to.have.property('materialAvailability').that.is.not.null;
      expect(result).to.have.property('recommendedProducts').that.is.an('array').with.length.above(0);
      expect(result.detectedElements).to.have.property('windows').that.is.an('array');
      expect(materialSupplierServiceStub.checkInventoryAvailability.calledOnce).to.be.true;
      expect(materialSupplierServiceStub.getRecommendedProducts.calledOnce).to.be.true;
    });
    
    /**
     * Escenario 8: Sin imágenes (error esperado)
     * - No se proporcionan imágenes 
     * - El sistema debe rechazar la petición indicando que se requiere al menos una imagen
     */
    it('debería rechazar la petición cuando no se proporcionan imágenes', async () => {
      // Arreglar
      const noImages: ProjectImage[] = [];
      const validNotes = "Necesito una cerca de madera";
      
      // Actuar y aseverar
      try {
        await engine.processUnstructuredInput(noImages, validNotes, sampleLocation);
        expect.fail('Debería haber lanzado una excepción');
      } catch (error) {
        expect(error).to.be.an('Error');
        const errorObj = error as Error; // Casting de tipo para acceder a la propiedad message
        expect(errorObj.message).to.include('Se requiere al menos una imagen');
      }
    });
    
    /**
     * Escenario 9: Caso con respuestas API mal formateadas
     * - APIs devuelven JSON mal formateado o formatos inesperados
     * - El sistema debe manejar y recuperarse de estos errores
     */
    it('debería manejar respuestas mal formateadas de las APIs', async () => {
      // Arreglar
      const validImages = createTestImages(1, true);
      const validNotes = "Cerca de madera de 100 pies";
      
      // Configurar stubs con respuestas mal formateadas
      openAIClientStub.complete.onFirstCall().resolves("Esto no es un JSON válido");
      anthropicClientStub.complete.resolves("Este texto no tiene formato JSON { solo tiene llaves sueltas }");
      
      // Actuar
      const result = await engine.processUnstructuredInput(validImages, validNotes, sampleLocation);
      
      // Aseverar - el sistema debe recuperarse y usar valores por defecto
      expect(result).to.have.property('projectType');
      expect(result.dimensions).to.exist;
      // El sistema usa valores por defecto cuando fallan los parseos
      expect(result.detectedElements).to.exist;
    });
    
    /**
     * Escenario 10: Prueba de estimación de dimensiones faltantes
     * - Información de dimensiones incompleta
     * - El sistema debe hacer estimaciones basadas en el tipo de proyecto
     */
    it('debería estimar dimensiones faltantes según el tipo de proyecto', async () => {
      // Arreglar
      const validImages = createTestImages(1, true);
      const incompleteNotes = "Necesito una cerca de madera, pero no estoy seguro de las dimensiones exactas.";
      
      // Configurar stubs con información incompleta de dimensiones
      openAIClientStub.complete.onFirstCall().resolves(JSON.stringify({
        projectType: 'fencing',
        materials: { 'wood': 'pressure treated pine' },
        // Sin información de dimensiones
      }));
      anthropicClientStub.complete.resolves(JSON.stringify({
        projectType: 'fence',
        projectSubtype: 'wood',
        // Sin dimensiones
      }));
      
      // Actuar
      const result = await engine.processUnstructuredInput(validImages, incompleteNotes, sampleLocation);
      
      // Aseverar - el sistema debe proporcionar estimaciones por defecto
      expect(result).to.have.property('projectType', 'fencing');
      expect(result.dimensions).to.have.property('length').that.is.a('number');
      expect(result.dimensions).to.have.property('height').that.is.a('number');
      // Las dimensiones deben ser los valores por defecto para cercas
      expect(result.dimensions.length).to.equal(100); // valor por defecto para cercas
      expect(result.dimensions.height).to.equal(6); // valor por defecto para cercas
    });
  });
});