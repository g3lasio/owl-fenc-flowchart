import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';

/**
 * Servicio para procesar entradas no estructuradas como texto libre,
 * imágenes, PDFs y otros documentos, para extraer información relevante
 * para el sistema de estimación
 */
export class UnstructuredInputService extends MicroserviceBase {
  private openAIClient: OpenAIClient;
  private anthropicClient: AnthropicClient;
  private persistentCache: PersistentCacheService;
  
  constructor(
    private readonly messageBroker: MessageBroker,
    private readonly cachePath: string = config.cache.cachePath
  ) {
    super('UnstructuredInputService', '1.0.0');
    
    // Inicializar clientes de IA
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    this.anthropicClient = new AnthropicClient(config.anthropic.apiKey);
    
    // Inicializar caché persistente
    this.persistentCache = new PersistentCacheService(this.cachePath);
    
    // Suscribirse a eventos
    this.configureBrokerSubscriptions();
  }
  
  /**
   * Configura las suscripciones a eventos del message broker
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('unstructured.process-text', this.handleProcessText.bind(this));
    this.messageBroker.subscribe('unstructured.process-image', this.handleProcessImage.bind(this));
    this.messageBroker.subscribe('unstructured.process-pdf', this.handleProcessPdf.bind(this));
    this.messageBroker.subscribe('unstructured.process-email', this.handleProcessEmail.bind(this));
    this.messageBroker.subscribe('unstructured.extract-dimensions', this.handleExtractDimensions.bind(this));
    this.messageBroker.subscribe('unstructured.extract-project-type', this.handleExtractProjectType.bind(this));
  }
  
  /**
   * Procesa texto libre para extraer información estructurada
   */
  private async handleProcessText(message: any): Promise<void> {
    const { requestId, text, context } = message;
    
    this.logInfo(`Procesando texto no estructurado, longitud: ${text.length} caracteres`);
    
    try {
      // Utilizar OpenAI para extraer información estructurada
      const structuredData = await this.extractStructuredDataFromText(text, context);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.text-processed', {
        requestId,
        structuredData,
        success: true
      });
    } catch (error) {
      this.logError(`Error procesando texto: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.text-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Procesa imágenes para extraer información relevante
   */
  private async handleProcessImage(message: any): Promise<void> {
    const { requestId, imageUrl, imageData, context } = message;
    
    this.logInfo(`Procesando imagen${imageUrl ? ' desde URL: ' + imageUrl : ' desde datos binarios'}`);
    
    try {
      let extractedText;
      let detectedObjects;
      
      // Utilizar OpenAI Vision para procesar la imagen
      if (imageUrl) {
        // Procesar imagen desde URL
        extractedText = await this.openAIClient.extractTextFromImageUrl(imageUrl);
        detectedObjects = await this.openAIClient.detectObjectsInImageUrl(imageUrl);
      } else if (imageData) {
        // Procesar imagen desde datos binarios (base64)
        extractedText = await this.openAIClient.extractTextFromImageData(imageData);
        detectedObjects = await this.openAIClient.detectObjectsInImageData(imageData);
      } else {
        throw new Error('Se requiere URL o datos de imagen');
      }
      
      // Extraer dimensiones y otros detalles relevantes
      const structuredData = await this.analyzeImageContent(extractedText, detectedObjects, context);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.image-processed', {
        requestId,
        extractedText,
        detectedObjects,
        structuredData,
        success: true
      });
    } catch (error) {
      this.logError(`Error procesando imagen: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.image-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Procesa PDFs para extraer información relevante
   */
  private async handleProcessPdf(message: any): Promise<void> {
    const { requestId, pdfUrl, pdfData, context } = message;
    
    this.logInfo(`Procesando PDF${pdfUrl ? ' desde URL: ' + pdfUrl : ' desde datos binarios'}`);
    
    try {
      // Extraer texto e imágenes del PDF
      const extractionResult = await this.extractContentFromPdf(pdfUrl, pdfData);
      
      // Procesar el texto extraído
      const structuredData = await this.extractStructuredDataFromText(
        extractionResult.text,
        {
          ...context,
          pdfTitle: extractionResult.title,
          pageCount: extractionResult.pageCount
        }
      );
      
      // Procesar imágenes extraídas si hay alguna
      let imagesAnalysis = [];
      if (extractionResult.images && extractionResult.images.length > 0) {
        imagesAnalysis = await Promise.all(
          extractionResult.images.map(img => this.analyzeImageContent(
            img.extractedText || '',
            img.detectedObjects || [],
            context
          ))
        );
      }
      
      // Combinar resultados
      const combinedAnalysis = this.combineTextAndImageAnalysis(structuredData, imagesAnalysis);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.pdf-processed', {
        requestId,
        pdfText: extractionResult.text,
        pdfTitle: extractionResult.title,
        pageCount: extractionResult.pageCount,
        structuredData: combinedAnalysis,
        success: true
      });
    } catch (error) {
      this.logError(`Error procesando PDF: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.pdf-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Procesa emails para extraer información sobre proyectos
   */
  private async handleProcessEmail(message: any): Promise<void> {
    const { requestId, emailContent, subject, sender, attachments } = message;
    
    this.logInfo(`Procesando email: "${subject}" de ${sender}`);
    
    try {
      // Extraer datos estructurados del contenido del email
      const emailData = await this.extractStructuredDataFromText(
        emailContent,
        { emailSubject: subject, emailSender: sender, isEmail: true }
      );
      
      // Procesar adjuntos si hay alguno
      let attachmentsData = [];
      if (attachments && attachments.length > 0) {
        this.logInfo(`Procesando ${attachments.length} adjuntos`);
        
        // Procesar cada adjunto según su tipo
        attachmentsData = await Promise.all(
          attachments.map(async (attachment: any) => {
            if (attachment.type === 'pdf') {
              const pdfResult = await this.extractContentFromPdf(null, attachment.data);
              return {
                type: 'pdf',
                name: attachment.name,
                analysis: await this.extractStructuredDataFromText(pdfResult.text, {
                  pdfTitle: pdfResult.title,
                  isAttachment: true
                })
              };
            } else if (attachment.type === 'image') {
              const imageText = await this.openAIClient.extractTextFromImageData(attachment.data);
              const imageObjects = await this.openAIClient.detectObjectsInImageData(attachment.data);
              return {
                type: 'image',
                name: attachment.name,
                analysis: await this.analyzeImageContent(imageText, imageObjects, {
                  isAttachment: true
                })
              };
            } else if (attachment.type === 'text') {
              return {
                type: 'text',
                name: attachment.name,
                analysis: await this.extractStructuredDataFromText(attachment.data, {
                  isAttachment: true
                })
              };
            }
            return {
              type: attachment.type,
              name: attachment.name,
              analysis: null
            };
          })
        );
      }
      
      // Combinar todos los datos
      const combinedAnalysis = this.combineEmailAnalysis(emailData, attachmentsData);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.email-processed', {
        requestId,
        emailData,
        attachmentsData,
        combinedAnalysis,
        success: true
      });
    } catch (error) {
      this.logError(`Error procesando email: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.email-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Extrae dimensiones de texto o datos no estructurados
   */
  private async handleExtractDimensions(message: any): Promise<void> {
    const { requestId, content, projectType } = message;
    
    this.logInfo(`Extrayendo dimensiones para proyecto tipo: ${projectType}`);
    
    try {
      // Extraer dimensiones usando OpenAI
      const dimensions = await this.extractDimensionsFromContent(content, projectType);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.dimensions-extracted', {
        requestId,
        dimensions,
        confidence: dimensions.confidence || 0.7,
        success: true
      });
    } catch (error) {
      this.logError(`Error extrayendo dimensiones: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.dimensions-extraction-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Detecta el tipo de proyecto a partir de contenido no estructurado
   */
  private async handleExtractProjectType(message: any): Promise<void> {
    const { requestId, content } = message;
    
    this.logInfo('Extrayendo tipo de proyecto de contenido no estructurado');
    
    try {
      // Extraer tipo de proyecto usando OpenAI
      const projectTypeInfo = await this.extractProjectTypeFromContent(content);
      
      // Publicar resultados
      await this.messageBroker.publish('unstructured.project-type-extracted', {
        requestId,
        projectType: projectTypeInfo.type,
        subtype: projectTypeInfo.subtype,
        confidence: projectTypeInfo.confidence,
        alternativeTypes: projectTypeInfo.alternativeTypes,
        success: true
      });
    } catch (error) {
      this.logError(`Error extrayendo tipo de proyecto: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publicar error
      await this.messageBroker.publish('unstructured.project-type-extraction-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Extrae información estructurada de texto usando IA
   */
  private async extractStructuredDataFromText(text: string, context?: any): Promise<any> {
    // Crear un prompt para OpenAI
    const prompt = `
    Analiza el siguiente texto y extrae cualquier información relevante para un proyecto de construcción.
    Estoy buscando específicamente:
    1. Tipo de proyecto (cerca, terraza, techo, concreto, etc.)
    2. Dimensiones (longitud, ancho, altura, área)
    3. Materiales mencionados
    4. Ubicación del proyecto
    5. Información del cliente (nombre, contacto)
    6. Plazos o fechas mencionadas
    7. Presupuesto o restricciones de costos
    8. Requisitos específicos o características

    Texto a analizar:
    ${text}

    ${context ? `Contexto adicional: ${JSON.stringify(context)}` : ''}

    Responde con un JSON estructurado que contenga la información extraída.
    `;

    try {
      const response = await this.openAIClient.complete({
        model: config.openai.defaultModel || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Eres un asistente especializado en extraer información estructurada de textos relacionados con proyectos de construcción.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      // Parsear la respuesta JSON
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        const content = response.choices[0].message.content;
        try {
          return JSON.parse(content);
        } catch (parseError) {
          this.logError('Error parseando respuesta JSON de OpenAI', parseError);
          // Intento de extraer JSON si está dentro de bloques de código
          const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]);
          }
          throw new Error('No se pudo obtener una respuesta JSON válida');
        }
      }
      throw new Error('No se recibió respuesta válida de OpenAI');
    } catch (error) {
      this.logError('Error en extractStructuredDataFromText', error);
      throw error;
    }
  }
  
  /**
   * Analiza el contenido de una imagen para extraer información relevante
   */
  private async analyzeImageContent(extractedText: string, detectedObjects: any[], context?: any): Promise<any> {
    // Si no hay texto extraído y no hay objetos detectados, no hay mucho que analizar
    if (!extractedText && (!detectedObjects || detectedObjects.length === 0)) {
      return {
        analysisSuccess: false,
        reason: 'No se encontró texto ni objetos en la imagen'
      };
    }

    // Crear un prompt para OpenAI
    const prompt = `
    Analiza la siguiente información extraída de una imagen relacionada con un proyecto de construcción.
    
    Texto extraído de la imagen:
    ${extractedText || 'No se extrajo texto de la imagen.'}
    
    Objetos detectados en la imagen:
    ${detectedObjects && detectedObjects.length > 0 ? JSON.stringify(detectedObjects) : 'No se detectaron objetos.'}
    
    ${context ? `Contexto adicional: ${JSON.stringify(context)}` : ''}
    
    Por favor extrae:
    1. Tipo de proyecto (cerca, terraza, techo, concreto, etc.)
    2. Dimensiones visibles o mencionadas
    3. Materiales visibles
    4. Cualquier otra información relevante para un estimado de construcción
    
    Responde con un JSON estructurado que contenga la información extraída.
    `;

    try {
      const response = await this.openAIClient.complete({
        model: config.openai.defaultModel || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Eres un asistente especializado en extraer información relevante para proyectos de construcción a partir de imágenes.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      // Parsear la respuesta JSON
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        const content = response.choices[0].message.content;
        return JSON.parse(content);
      }
      throw new Error('No se recibió respuesta válida de OpenAI');
    } catch (error) {
      this.logError('Error en analyzeImageContent', error);
      throw error;
    }
  }
  
  /**
   * Extrae contenido (texto e imágenes) de un PDF
   */
  private async extractContentFromPdf(pdfUrl?: string, pdfData?: string): Promise<{
    text: string,
    title: string,
    pageCount: number,
    images?: Array<{
      pageNumber: number,
      extractedText?: string,
      detectedObjects?: any[]
    }>
  }> {
    // En una implementación real, utilizaríamos una biblioteca como pdf.js o un servicio
    // especializado para extraer texto e imágenes de PDFs. Por ahora, simulamos el resultado.
    
    this.logInfo('Extrayendo contenido de PDF');
    
    // Simulación: extraer texto
    const extractedText = "Este es un texto simulado extraído de un PDF. " +
                         "Proyecto: Cerca de madera. Dimensiones: 100 pies de largo por 6 pies de alto. " +
                         "Cliente: Juan Pérez. Teléfono: 555-1234. Dirección: 123 Calle Principal.";
    
    // Simulación: metadata del PDF
    const pdfTitle = "Estimado de Proyecto - Cerca Residencial";
    const pageCount = 3;
    
    // Simulación: imágenes extraídas (en una implementación real, procesaríamos estas imágenes)
    const extractedImages = [
      {
        pageNumber: 1,
        extractedText: "Plano de cerca: 100' x 6'",
        detectedObjects: [
          { name: "fence", confidence: 0.95 },
          { name: "measuring tape", confidence: 0.85 }
        ]
      },
      {
        pageNumber: 2,
        extractedText: "Especificaciones de materiales: Postes de cedro de 4x4, tablas de cedro de 1x6",
        detectedObjects: [
          { name: "wood", confidence: 0.92 },
          { name: "lumber", confidence: 0.88 }
        ]
      }
    ];
    
    return {
      text: extractedText,
      title: pdfTitle,
      pageCount: pageCount,
      images: extractedImages
    };
  }
  
  /**
   * Combina análisis de texto e imágenes para obtener un resultado consolidado
   */
  private combineTextAndImageAnalysis(textAnalysis: any, imagesAnalysis: any[]): any {
    // Crear objeto combinado
    const combined = { ...textAnalysis };
    
    // Añadir análisis de imágenes
    combined.imagesAnalysis = imagesAnalysis;
    
    // Consolidar información
    combined.consolidatedInfo = {
      projectType: textAnalysis.projectType || this.getMostCommonValue(imagesAnalysis, 'projectType'),
      dimensions: {
        ...textAnalysis.dimensions,
        // Añadir dimensiones de imágenes que no estén en el texto
        ...this.consolidateImageDimensions(imagesAnalysis, textAnalysis.dimensions)
      },
      materials: this.consolidateMaterials(textAnalysis.materials, imagesAnalysis),
      // Añadir otros campos consolidados según sea necesario
    };
    
    // Calcular confianza general
    combined.confidence = this.calculateOverallConfidence(textAnalysis, imagesAnalysis);
    
    return combined;
  }
  
  /**
   * Combina análisis de email y sus adjuntos
   */
  private combineEmailAnalysis(emailData: any, attachmentsData: any[]): any {
    // Crear objeto combinado
    const combined = {
      emailInfo: emailData,
      attachments: attachmentsData,
      consolidated: {}
    };
    
    // Consolidar información del email y adjuntos
    // Priorizar información de adjuntos sobre el email, ya que suelen tener datos más precisos
    
    // 1. Identificar el tipo de proyecto
    const projectTypes = [
      emailData.projectType,
      ...attachmentsData.map(a => a.analysis?.projectType).filter(Boolean)
    ];
    combined.consolidated.projectType = this.getMostCommonValue(projectTypes);
    
    // 2. Consolidar dimensiones (dar prioridad a adjuntos de tipo PDF e imagen)
    const dimensions = {
      ...emailData.dimensions,
      ...this.consolidateAttachmentDimensions(attachmentsData)
    };
    combined.consolidated.dimensions = dimensions;
    
    // 3. Consolidar materiales
    combined.consolidated.materials = this.consolidateAttachmentMaterials(
      emailData.materials,
      attachmentsData
    );
    
    // 4. Consolidar información del cliente
    combined.consolidated.clientInfo = {
      ...emailData.clientInfo,
      // Añadir cualquier información adicional encontrada en adjuntos
      ...this.consolidateClientInfo(attachmentsData)
    };
    
    // 5. Calcular confianza general
    combined.consolidated.confidence = this.calculateEmailConfidence(emailData, attachmentsData);
    
    return combined;
  }
  
  /**
   * Extrae dimensiones específicas del contenido
   */
  private async extractDimensionsFromContent(content: string, projectType: string): Promise<any> {
    // Crear un prompt para OpenAI específico para dimensiones
    const prompt = `
    A partir del siguiente contenido, extrae todas las dimensiones relevantes para un proyecto de ${projectType}.
    
    Contenido:
    ${content}
    
    Dependiendo del tipo de proyecto, extrae dimensiones como:
    - Para cercas: longitud, altura, espaciado entre postes
    - Para terrazas: longitud, ancho, altura desde el suelo, tamaño de escaleras
    - Para techos: área, pendiente, aleros
    - Para concreto: longitud, ancho, grosor, área
    
    Para cada dimensión, proporciona:
    1. El valor numérico
    2. La unidad de medida (pies, pulgadas, metros, etc.)
    3. El nivel de confianza (0.0 a 1.0) basado en qué tan explícito estaba en el contenido
    
    Responde con un JSON estructurado con las dimensiones detectadas y una confianza general.
    `;

    try {
      const response = await this.openAIClient.complete({
        model: config.openai.defaultModel || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Eres un asistente especializado en extraer dimensiones precisas para proyectos de construcción.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      // Parsear la respuesta JSON
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        const content = response.choices[0].message.content;
        return JSON.parse(content);
      }
      throw new Error('No se recibió respuesta válida de OpenAI');
    } catch (error) {
      this.logError('Error en extractDimensionsFromContent', error);
      throw error;
    }
  }
  
  /**
   * Extrae el tipo de proyecto del contenido
   */
  private async extractProjectTypeFromContent(content: string): Promise<{
    type: string,
    subtype?: string,
    confidence: number,
    alternativeTypes?: {type: string, confidence: number}[]
  }> {
    // Crear un prompt para OpenAI específico para tipo de proyecto
    const prompt = `
    A partir del siguiente contenido, identifica el tipo de proyecto de construcción que se describe.
    
    Contenido:
    ${content}
    
    Clasifica el proyecto en una de estas categorías:
    - fence / fencing (cerca)
    - deck / decking (terraza)
    - roof / roofing (techo)
    - concrete (concreto)
    - other (especificar)
    
    Si es posible, identifica también un subtipo más específico. Por ejemplo:
    - Para cercas: madera, vinilo, hierro forjado, alambre, etc.
    - Para terrazas: madera, compuesto, PVC, etc.
    - Para techos: tejas, metal, plano, etc.
    - Para concreto: patio, entrada, fundación, etc.
    
    Proporciona:
    1. El tipo principal de proyecto
    2. El subtipo (si se puede determinar)
    3. Un nivel de confianza de 0.0 a 1.0
    4. Tipos alternativos posibles con su nivel de confianza
    
    Responde con un JSON estructurado.
    `;

    try {
      const response = await this.openAIClient.complete({
        model: config.openai.defaultModel || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Eres un asistente especializado en identificar tipos de proyectos de construcción.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      // Parsear la respuesta JSON
      if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        const content = response.choices[0].message.content;
        return JSON.parse(content);
      }
      throw new Error('No se recibió respuesta válida de OpenAI');
    } catch (error) {
      this.logError('Error en extractProjectTypeFromContent', error);
      throw error;
    }
  }
  
  /* Funciones auxiliares */
  
  /**
   * Obtiene el valor más común en una lista de objetos
   */
  private getMostCommonValue(items: any[], key?: string): any {
    const valueMap = new Map();
    
    items.forEach(item => {
      const value = key ? item[key] : item;
      if (value) {
        valueMap.set(value, (valueMap.get(value) || 0) + 1);
      }
    });
    
    if (valueMap.size === 0) {
      return null;
    }
    
    return [...valueMap.entries()]
      .sort((a, b) => b[1] - a[1])
      [0][0];
  }
  
  /**
   * Consolida dimensiones de análisis de imágenes
   */
  private consolidateImageDimensions(imagesAnalysis: any[], existingDimensions: any): any {
    const consolidatedDimensions = { ...existingDimensions };
    
    imagesAnalysis.forEach(analysis => {
      if (analysis.dimensions) {
        Object.entries(analysis.dimensions).forEach(([key, value]) => {
          // Solo añadir si no existe o tiene mayor confianza
          if (!consolidatedDimensions[key] || 
              (analysis.dimensions.confidence && 
               (!consolidatedDimensions.confidence || 
                analysis.dimensions.confidence > consolidatedDimensions.confidence))) {
            consolidatedDimensions[key] = value;
          }
        });
      }
    });
    
    return consolidatedDimensions;
  }
  
  /**
   * Consolida materiales de texto e imágenes
   */
  private consolidateMaterials(textMaterials: any[], imagesAnalysis: any[]): string[] {
    const materialsSet = new Set<string>();
    
    // Añadir materiales del texto
    if (Array.isArray(textMaterials)) {
      textMaterials.forEach(material => materialsSet.add(material));
    }
    
    // Añadir materiales de imágenes
    imagesAnalysis.forEach(analysis => {
      if (analysis.materials && Array.isArray(analysis.materials)) {
        analysis.materials.forEach((material: string) => materialsSet.add(material));
      }
    });
    
    return Array.from(materialsSet);
  }
  
  /**
   * Calcula la confianza general del análisis
   */
  private calculateOverallConfidence(textAnalysis: any, imagesAnalysis: any[]): number {
    let confidenceSum = textAnalysis.confidence || 0.7;
    let confidenceCount = 1;
    
    imagesAnalysis.forEach(analysis => {
      if (analysis.confidence) {
        confidenceSum += analysis.confidence;
        confidenceCount++;
      }
    });
    
    return confidenceSum / confidenceCount;
  }
  
  /**
   * Consolida dimensiones de adjuntos de email
   */
  private consolidateAttachmentDimensions(attachmentsData: any[]): any {
    const dimensions: any = {};
    
    attachmentsData.forEach(attachment => {
      if (attachment.analysis?.dimensions) {
        Object.entries(attachment.analysis.dimensions).forEach(([key, value]) => {
          // Priorizar PDF sobre imágenes y texto
          if (!dimensions[key] || 
              (attachment.type === 'pdf' && dimensions.sourceType !== 'pdf') ||
              (attachment.type === 'image' && dimensions.sourceType === 'text')) {
            dimensions[key] = value;
            dimensions.sourceType = attachment.type;
          }
        });
      }
    });
    
    return dimensions;
  }
  
  /**
   * Consolida materiales de adjuntos de email
   */
  private consolidateAttachmentMaterials(emailMaterials: any[], attachmentsData: any[]): string[] {
    const materialsSet = new Set<string>();
    
    // Añadir materiales del email
    if (Array.isArray(emailMaterials)) {
      emailMaterials.forEach(material => materialsSet.add(material));
    }
    
    // Añadir materiales de adjuntos
    attachmentsData.forEach(attachment => {
      if (attachment.analysis?.materials && Array.isArray(attachment.analysis.materials)) {
        attachment.analysis.materials.forEach((material: string) => materialsSet.add(material));
      }
    });
    
    return Array.from(materialsSet);
  }
  
  /**
   * Consolida información del cliente de adjuntos
   */
  private consolidateClientInfo(attachmentsData: any[]): any {
    const clientInfo: any = {};
    
    // Extraer información del cliente de los adjuntos
    attachmentsData.forEach(attachment => {
      if (attachment.analysis?.clientInfo) {
        Object.entries(attachment.analysis.clientInfo).forEach(([key, value]) => {
          // Solo sobrescribir si el valor no está vacío
          if (value && (!clientInfo[key] || attachment.type === 'pdf')) {
            clientInfo[key] = value;
          }
        });
      }
    });
    
    return clientInfo;
  }
  
  /**
   * Calcula la confianza general del análisis de email
   */
  private calculateEmailConfidence(emailData: any, attachmentsData: any[]): number {
    // Ponderaciones: PDF > Imagen > Email
    const weights = {
      pdf: 3,
      image: 2,
      email: 1,
      text: 1
    };
    
    let weightedSum = (emailData.confidence || 0.6) * weights.email;
    let weightSum = weights.email;
    
    attachmentsData.forEach(attachment => {
      if (attachment.analysis?.confidence) {
        const weight = weights[attachment.type as keyof typeof weights] || 1;
        weightedSum += attachment.analysis.confidence * weight;
        weightSum += weight;
      }
    });
    
    return weightedSum / weightSum;
  }
}
