import { OpenAIClient } from './openai.client';
import { AnthropicClient } from './anthropic.client';
import { ContractorProfileService, ContractorFeedback } from './contractor-profile.service';
import { RequiredMaterial, RequiredService } from '../interfaces/fence.interfaces';
import { ProjectDetails } from '../interfaces/flow-manager.interfaces';
import { PersistentCacheService } from './persistent-cache.service';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Servicio para analizar datos históricos (estimados e invoices)
 * y extraer conocimiento para mejorar la precisión de Mervin
 */
export class HistoricalDataAnalyzer {
    private cache: PersistentCacheService;

    constructor(
        private readonly openAIClient: OpenAIClient,
        private readonly anthropicClient: AnthropicClient,
        private readonly contractorProfileService: ContractorProfileService,
        private readonly contractorId: string
    ) {
        this.cache = new PersistentCacheService(
            path.join(config.cache.cachePath, `analyst_${contractorId}`)
        );
    }

    /**
     * Analiza un documento de estimado histórico para extraer información relevante
     * y actualizar el perfil del contratista
     */
    async analyzeEstimate(
        estimateId: string,
        estimateData: any,
        wasApproved: boolean
    ): Promise<boolean> {
        try {
            // 1. Extraer información relevante del estimado
            const projectType = estimateData.projectType || 'unknown';
            const projectSubtype = estimateData.projectSubtype || 'unknown';

            // 2. Analizar materiales y tasas de servicios
            const materials = this.extractMaterials(estimateData);
            const services = this.extractServices(estimateData);

            // 3. Crear preferencias de materiales basadas en el estimado
            const materialPreferences = materials.map(material => ({
                projectType,
                projectSubtype,
                materialName: material.name,
                supplier: material.supplier,
                preferenceWeight: wasApproved ? 2 : 1, // Mayor peso si fue aprobado
                notes: `Extraído de estimado ${estimateId}`
            }));

            // 4. Actualizar perfil del contratista con estas preferencias
            if (materialPreferences.length > 0) {
                await this.contractorProfileService.updateMaterialPreferences(
                    this.contractorId,
                    materialPreferences
                );
            }

            // 5. Actualizar el historial de estimados y tasas de servicio
            await this.contractorProfileService.updateServiceRates(
                this.contractorId,
                estimateId,
                wasApproved
            );

            // 6. Registrar análisis en el caché para referencia futura
            this.logAnalysis('estimate', estimateId, {
                projectType,
                projectSubtype,
                materialCount: materials.length,
                serviceCount: services.length,
                wasApproved,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            console.error('Error analyzing historical estimate:', error);
            return false;
        }
    }

    /**
     * Analiza una factura histórica para extraer información que mejore
     * la precisión de los estimados
     */
    async analyzeInvoice(
        invoiceId: string,
        invoiceData: any,
        relatedEstimateId?: string
    ): Promise<boolean> {
        try {
            // 1. Extraer información básica de la factura
            const projectType = invoiceData.projectType || 'unknown';
            const projectSubtype = invoiceData.projectSubtype || 'unknown';

            // 2. Extraer materiales y servicios reales utilizados
            const actualMaterials = this.extractMaterials(invoiceData);
            const actualServices = this.extractServices(invoiceData);

            // 3. Si hay un estimado relacionado, analizar la diferencia para aprendizaje
            if (relatedEstimateId) {
                await this.compareWithEstimate(
                    relatedEstimateId,
                    projectType,
                    projectSubtype,
                    actualMaterials,
                    actualServices,
                    invoiceData.totalAmount
                );
            }

            // 4. Crear preferencias de materiales con mayor peso (son materiales realmente utilizados)
            const materialPreferences = actualMaterials.map(material => ({
                projectType,
                projectSubtype,
                materialName: material.name,
                supplier: material.supplier,
                preferenceWeight: 3, // Mayor peso para materiales realmente usados
                notes: `Utilizado en proyecto facturado ${invoiceId}`
            }));

            // 5. Actualizar perfil del contratista con estas preferencias de mayor precisión
            if (materialPreferences.length > 0) {
                await this.contractorProfileService.updateMaterialPreferences(
                    this.contractorId,
                    materialPreferences
                );
            }

            // 6. Registrar análisis en el caché
            this.logAnalysis('invoice', invoiceId, {
                projectType,
                projectSubtype,
                materialCount: actualMaterials.length,
                serviceCount: actualServices.length,
                relatedEstimateId,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            console.error('Error analyzing historical invoice:', error);
            return false;
        }
    }

    /**
     * Analiza todas las facturas históricas disponibles para un contratista
     * para mejorar la precisión de los futuros estimados
     */
    async analyzeAllHistoricalDocuments(
        documentsDirectory: string
    ): Promise<{ analyzed: number, failed: number }> {
        try {
            const results = { analyzed: 0, failed: 0 };

            // Comprobar si el directorio existe
            if (!fs.existsSync(documentsDirectory)) {
                console.error(`Directory not found: ${documentsDirectory}`);
                return results;
            }

            // Leer todos los archivos del directorio
            const files = fs.readdirSync(documentsDirectory)
                .filter(file => file.endsWith('.json'));

            console.log(`Found ${files.length} historical documents to analyze`);

            // Procesar cada archivo
            for (const file of files) {
                const filePath = path.join(documentsDirectory, file);
                try {
                    // Leer el contenido del archivo
                    const documentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    // Determinar si es un estimado o una factura
                    if (file.includes('estimate')) {
                        const success = await this.analyzeEstimate(
                            path.basename(file, '.json'),
                            documentData,
                            documentData.wasApproved || false
                        );

                        if (success) results.analyzed++;
                        else results.failed++;
                    } else if (file.includes('invoice')) {
                        const success = await this.analyzeInvoice(
                            path.basename(file, '.json'),
                            documentData,
                            documentData.relatedEstimateId
                        );

                        if (success) results.analyzed++;
                        else results.failed++;
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                    results.failed++;
                }
            }

            console.log(`Analysis complete. Analyzed: ${results.analyzed}, Failed: ${results.failed}`);
            return results;
        } catch (error) {
            console.error('Error analyzing historical documents:', error);
            return { analyzed: 0, failed: 0 };
        }
    }

    /**
     * Utiliza IA para extraer conocimiento específico del contractor de documentos previos
     */
    async extractContractorKnowledgeFromDocuments(
        documentsDirectory: string
    ): Promise<boolean> {
        try {
            // 1. Recopilar texto de todos los documentos para análisis
            const allDocumentText = await this.collectDocumentText(documentsDirectory);

            if (!allDocumentText) {
                console.error('No document text found for analysis');
                return false;
            }

            // 2. Utilizar IA para extraer conocimiento específico
            const knowledge = await this.extractKnowledgeWithAI(allDocumentText);

            if (!knowledge) {
                console.error('Failed to extract knowledge with AI');
                return false;
            }

            // 3. Aplicar el conocimiento extraído al perfil del contratista

            // 3.1 Extraer y aplicar preferencias de materiales
            if (knowledge.materialPreferences && knowledge.materialPreferences.length > 0) {
                await this.contractorProfileService.updateMaterialPreferences(
                    this.contractorId,
                    knowledge.materialPreferences.map(pref => ({
                        projectType: pref.projectType,
                        projectSubtype: pref.projectSubtype,
                        materialName: pref.materialName,
                        supplier: pref.supplier,
                        preferenceWeight: 4, // Alto peso para conocimiento extraído por IA
                        notes: 'Extraído por análisis de IA de documentos históricos'
                    }))
                );
            }

            // 3.2 Registrar feedback para mejorar el perfil
            if (knowledge.feedback) {
                await this.contractorProfileService.recordContractorFeedback(
                    this.contractorId,
                    'ai_analysis_' + Date.now(),
                    knowledge.feedback
                );
            }

            // 4. Guardar un resumen del conocimiento extraído
            this.cache.set(
                'ai_knowledge_extraction_' + Date.now(),
                knowledge,
                60 * 60 * 24 * 30 // 30 días
            );

            return true;
        } catch (error) {
            console.error('Error extracting contractor knowledge:', error);
            return false;
        }
    }

    /**
     * Compara los datos reales de una factura con el estimado relacionado
     * para generar feedback y mejorar futuros estimados
     */
    private async compareWithEstimate(
        estimateId: string,
        projectType: string,
        projectSubtype: string,
        actualMaterials: Array<{ name: string, quantity: number, supplier?: string }>,
        actualServices: Array<{ name: string, hours: number, rate: number }>,
        actualTotalAmount: number
    ): Promise<void> {
        try {
            // En una implementación real, obtendríamos el estimado de la BD
            // const estimateData = await someDbService.getEstimate(estimateId);

            // Simulamos un estimado para este ejemplo
            const estimateData = {
                materials: [
                    { name: 'Wood Planks', quantity: 50 },
                    { name: 'Concrete Mix', quantity: 10 },
                    { name: 'Nails', quantity: 2 }
                ],
                services: [
                    { name: 'Installation', hours: 16, rate: 75 },
                    { name: 'Site Preparation', hours: 4, rate: 65 }
                ],
                totalAmount: 2450
            };

            // Comparar materiales para encontrar diferencias
            const materialCorrections: Array<{
                originalMaterial: string;
                correctMaterial: string;
                preferredSupplier?: string;
            }> = [];

            // Buscar materiales en el estimado que no estén en la factura (no utilizados)
            for (const estMaterial of estimateData.materials) {
                const matchingActual = actualMaterials.find(m => m.name === estMaterial.name);

                // Si no se encontró o la cantidad es significativamente diferente
                if (!matchingActual || Math.abs(matchingActual.quantity - estMaterial.quantity) / estMaterial.quantity > 0.2) {
                    materialCorrections.push({
                        originalMaterial: estMaterial.name,
                        correctMaterial: matchingActual ? matchingActual.name : 'Not needed',
                        preferredSupplier: matchingActual?.supplier
                    });
                }
            }

            // Buscar materiales en la factura que no estén en el estimado (añadidos)
            for (const actMaterial of actualMaterials) {
                const matchingEst = estimateData.materials.find(m => m.name === actMaterial.name);

                if (!matchingEst) {
                    materialCorrections.push({
                        originalMaterial: 'Not included',
                        correctMaterial: actMaterial.name,
                        preferredSupplier: actMaterial.supplier
                    });
                }
            }

            // Comparar servicios para encontrar diferencias en tasas o horas
            const serviceRateCorrections: Array<{
                serviceName: string;
                originalRate: number;
                correctRate: number;
            }> = [];

            for (const estService of estimateData.services) {
                const matchingActual = actualServices.find(s => s.name === estService.name);

                if (matchingActual && Math.abs(matchingActual.rate - estService.rate) / estService.rate > 0.1) {
                    serviceRateCorrections.push({
                        serviceName: estService.name,
                        originalRate: estService.rate,
                        correctRate: matchingActual.rate
                    });
                }
            }

            // Crear feedback basado en las diferencias encontradas
            const feedback: ContractorFeedback = {
                projectType,
                projectSubtype,
                comments: `Análisis automático comparando factura con estimado ${estimateId}`,
                materialCorrections: materialCorrections.length > 0 ? materialCorrections : undefined,
                serviceRateCorrections: serviceRateCorrections.length > 0 ? serviceRateCorrections : undefined
            };

            // Registrar el feedback para mejorar futuros estimados
            if (materialCorrections.length > 0 || serviceRateCorrections.length > 0) {
                await this.contractorProfileService.recordContractorFeedback(
                    this.contractorId,
                    `auto_analysis_${estimateId}`,
                    feedback
                );
            }
        } catch (error) {
            console.error('Error comparing invoice with estimate:', error);
        }
    }

    /**
     * Extrae lista de materiales de un documento (estimado o factura)
     */
    private extractMaterials(documentData: any): Array<{ name: string, quantity: number, supplier?: string }> {
        const materials: Array<{ name: string, quantity: number, supplier?: string }> = [];

        // Comprobar diferentes posibles estructuras de datos
        if (documentData.materials && Array.isArray(documentData.materials)) {
            for (const material of documentData.materials) {
                materials.push({
                    name: material.name || material.description || '',
                    quantity: material.quantity || 0,
                    supplier: material.supplier || material.vendor || undefined
                });
            }
        } else if (documentData.items && Array.isArray(documentData.items)) {
            // Alternativa: los materiales pueden estar en un array "items"
            for (const item of documentData.items) {
                if (item.type === 'material' || !item.type) {
                    materials.push({
                        name: item.name || item.description || '',
                        quantity: item.quantity || 0,
                        supplier: item.supplier || item.vendor || undefined
                    });
                }
            }
        }

        return materials;
    }

    /**
     * Extrae lista de servicios de un documento (estimado o factura)
     */
    private extractServices(documentData: any): Array<{ name: string, hours: number, rate: number }> {
        const services: Array<{ name: string, hours: number, rate: number }> = [];

        // Comprobar diferentes posibles estructuras de datos
        if (documentData.services && Array.isArray(documentData.services)) {
            for (const service of documentData.services) {
                services.push({
                    name: service.name || service.description || '',
                    hours: service.hours || 0,
                    rate: service.rate || service.hourlyRate || 0
                });
            }
        } else if (documentData.items && Array.isArray(documentData.items)) {
            // Alternativa: los servicios pueden estar en un array "items"
            for (const item of documentData.items) {
                if (item.type === 'service' || item.type === 'labor') {
                    services.push({
                        name: item.name || item.description || '',
                        hours: item.hours || item.quantity || 0,
                        rate: item.rate || item.unitPrice || 0
                    });
                }
            }
        }

        return services;
    }

    /**
     * Recopila texto de todos los documentos para análisis de IA
     */
    private async collectDocumentText(documentsDirectory: string): Promise<string | null> {
        try {
            if (!fs.existsSync(documentsDirectory)) {
                return null;
            }

            const files = fs.readdirSync(documentsDirectory)
                .filter(file => file.endsWith('.json'))
                .slice(0, 20); // Limitar a 20 documentos para evitar sobrecargar la IA

            if (files.length === 0) {
                return null;
            }

            const documentsText: string[] = [];

            for (const file of files) {
                const filePath = path.join(documentsDirectory, file);
                try {
                    const documentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    // Formatear documento para análisis
                    const documentType = file.includes('estimate') ? 'ESTIMATE' : 'INVOICE';
                    const documentId = path.basename(file, '.json');

                    const formattedText = `
            ===== ${documentType}: ${documentId} =====
            Project Type: ${documentData.projectType || 'Unknown'}
            Project Subtype: ${documentData.projectSubtype || 'Unknown'}
            Total Amount: ${documentData.totalAmount || 'Unknown'}
            
            Materials:
            ${this.formatMaterialsForText(this.extractMaterials(documentData))}
            
            Services:
            ${this.formatServicesForText(this.extractServices(documentData))}
            
            Additional Notes: ${documentData.notes || 'None'}
            ===============================
          `;

                    documentsText.push(formattedText);
                } catch (error) {
                    console.error(`Error processing file ${file} for AI analysis:`, error);
                }
            }

            return documentsText.join('\n\n');
        } catch (error) {
            console.error('Error collecting document text:', error);
            return null;
        }
    }

    /**
     * Formatea materiales para texto legible
     */
    private formatMaterialsForText(materials: Array<{ name: string, quantity: number, supplier?: string }>): string {
        if (materials.length === 0) {
            return 'None';
        }

        return materials.map(m =>
            `  - ${m.name}: ${m.quantity} units${m.supplier ? ` (Supplier: ${m.supplier})` : ''}`
        ).join('\n');
    }

    /**
     * Formatea servicios para texto legible
     */
    private formatServicesForText(services: Array<{ name: string, hours: number, rate: number }>): string {
        if (services.length === 0) {
            return 'None';
        }

        return services.map(s =>
            `  - ${s.name}: ${s.hours} hours at $${s.rate}/hour`
        ).join('\n');
    }

    /**
     * Utiliza IA para extraer conocimiento de documentos históricos
     */
    private async extractKnowledgeWithAI(documentText: string): Promise<any | null> {
        try {
            // Preferir Anthropic Claude para esta tarea debido a su mejor contexto
            let response;

            if (this.anthropicClient) {
                response = await this.extractKnowledgeWithAnthropic(documentText);
            } else if (this.openAIClient) {
                response = await this.extractKnowledgeWithOpenAI(documentText);
            } else {
                console.error('No AI client available for knowledge extraction');
                return null;
            }

            if (!response) {
                return null;
            }

            // Extraer JSON de la respuesta
            const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                response.match(/(\{[\s\S]*?\})/);

            if (jsonMatch && jsonMatch[1]) {
                try {
                    return JSON.parse(jsonMatch[1]);
                } catch (error) {
                    console.error('Error parsing AI response as JSON:', error);
                    return null;
                }
            }

            return null;
        } catch (error) {
            console.error('Error extracting knowledge with AI:', error);
            return null;
        }
    }

    /**
     * Extrae conocimiento utilizando Anthropic Claude
     */
    private async extractKnowledgeWithAnthropic(documentText: string): Promise<string | null> {
        try {
            const prompt = `
        Eres un asistente especializado en análisis de datos de la industria de la construcción.
        Necesito que analices los siguientes documentos históricos (estimados e invoices) de un contratista
        y extraigas información valiosa sobre sus preferencias, materiales frecuentes, y tasas de servicio.
        
        DOCUMENTOS HISTÓRICOS:
        ${documentText}
        
        Por favor, analiza estos documentos y devuelve:
        
        1. Las preferencias de materiales que detectes para cada tipo de proyecto
        2. Las tasas de servicio típicas que cobra el contratista
        3. Cualquier patrón o consistencia que observes en sus estimados o facturas
        4. Correcciones o diferencias notables entre estimados y facturas correspondientes
        
        Formatea tu respuesta como un objeto JSON con la siguiente estructura:
        
        ```json
            {
                "materialPreferences": [
                    {
                        "projectType": "tipo de proyecto",
                        "projectSubtype": "subtipo de proyecto",
                        "materialName": "nombre del material",
                        "supplier": "proveedor preferido (si se menciona)"
                    }
                ],
                    "serviceRates": [
                        {
                            "projectType": "tipo de proyecto",
                            "serviceName": "nombre del servicio",
                            "rate": 75.50
                        }
                    ],
                        "feedback": {
                    "projectType": "tipo de proyecto más común",
                        "projectSubtype": "subtipo de proyecto más común",
                            "comments": "observaciones generales sobre patrones",
                                "materialCorrections": [
                                    {
                                        "originalMaterial": "material frecuentemente sobrestimado",
                                        "correctMaterial": "lo que realmente se usa"
                                    }
                                ],
                                    "serviceRateCorrections": [
                                        {
                                            "serviceName": "servicio con discrepancia de tasa",
                                            "originalRate": 65,
                                            "correctRate": 80
                                        }
                                    ]
                }
            }
            ```
        
        Asegúrate de basar tu análisis solo en la información proporcionada en los documentos.
      `;

            const response = await this.anthropicClient.complete({
                prompt,
                maxTokens: 4000,
                model: 'claude-3-opus-20240229' // Usar el modelo más avanzado
            });

            return response;
        } catch (error) {
            console.error('Error extracting knowledge with Anthropic:', error);
            return null;
        }
    }

    /**
     * Extrae conocimiento utilizando OpenAI
     */
    private async extractKnowledgeWithOpenAI(documentText: string): Promise<string | null> {
        try {
            const prompt = `
        Eres un asistente especializado en análisis de datos de la industria de la construcción.
        Necesito que analices los siguientes documentos históricos (estimados e invoices) de un contratista
        y extraigas información valiosa sobre sus preferencias, materiales frecuentes, y tasas de servicio.
        
        DOCUMENTOS HISTÓRICOS:
        ${documentText}
        
        Por favor, analiza estos documentos y devuelve:
        
        1. Las preferencias de materiales que detectes para cada tipo de proyecto
        2. Las tasas de servicio típicas que cobra el contratista
        3. Cualquier patrón o consistencia que observes en sus estimados o facturas
        4. Correcciones o diferencias notables entre estimados y facturas correspondientes
        
        Formatea tu respuesta como un objeto JSON con la siguiente estructura:
        
        {
          "materialPreferences": [
            {
              "projectType": "tipo de proyecto",
              "projectSubtype": "subtipo de proyecto",
              "materialName": "nombre del material",
              "supplier": "proveedor preferido (si se menciona)"
            }
          ],
          "serviceRates": [
            {
              "projectType": "tipo de proyecto",
              "serviceName": "nombre del servicio",
              "rate": 75.50
            }
          ],
          "feedback": {
            "projectType": "tipo de proyecto más común",
            "projectSubtype": "subtipo de proyecto más común",
            "comments": "observaciones generales sobre patrones",
            "materialCorrections": [
              {
                "originalMaterial": "material frecuentemente sobrestimado",
                "correctMaterial": "lo que realmente se usa"
              }
            ],
            "serviceRateCorrections": [
              {
                "serviceName": "servicio con discrepancia de tasa",
                "originalRate": 65,
                "correctRate": 80
              }
            ]
          }
        }
        
        Asegúrate de basar tu análisis solo en la información proporcionada en los documentos.
      `;

            const response = await this.openAIClient.complete({
                prompt,
                maxTokens: 4000,
                temperature: 0.2,
                model: 'gpt-4o' // Usar GPT-4o para mejor comprensión de documentos
            });

            return response;
        } catch (error) {
            console.error('Error extracting knowledge with OpenAI:', error);
            return null;
        }
    }

    /**
     * Registra un análisis en el caché para referencia futura
     */
    private logAnalysis(
        type: 'estimate' | 'invoice',
        documentId: string,
        details: any
    ): void {
        try {
            const cacheKey = `analysis_${type}_${documentId}`;
            this.cache.set(cacheKey, details, 60 * 60 * 24 * 30); // 30 días

            // Mantener registro de documentos analizados
            const analyzedListKey = `analyzed_${type}s`;
            const analyzedList = this.cache.get<string[]>(analyzedListKey) || [];

            if (!analyzedList.includes(documentId)) {
                analyzedList.push(documentId);
                this.cache.set(analyzedListKey, analyzedList, 60 * 60 * 24 * 30); // 30 días
            }
        } catch (error) {
            console.error('Error logging analysis:', error);
        }
    }
}