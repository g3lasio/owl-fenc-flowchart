import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as util from 'util';
import { v4 as uuidv4 } from 'uuid';
import { ArchitecturalPlanEngine } from '../engines/architectural-plan.engine';
import { DeepSearchEngine } from '../engines/deepsearch.engine';
import multer from 'multer';
import { Location } from '../interfaces/fence.interfaces';
import { config } from '../config/config';

// Configuración para manejo de archivos multipart/form-data
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Límite de 20MB
  }
});

/**
 * Controlador para análisis de planos arquitectónicos y generación de estimados
 */
export class ArchitecturalPlanController {
  
  constructor(
    private readonly architecturalPlanEngine: ArchitecturalPlanEngine,
    private readonly deepSearchEngine: DeepSearchEngine
  ) {}
  
  /**
   * Configura las rutas del controlador en la aplicación Express
   * @param app Aplicación Express
   */
  setupRoutes(app: any): void {
    // Ruta para análisis de planos
    app.post('/api/plans/analyze', upload.single('planFile'), this.analyzePlan.bind(this));
    
    // Ruta para generación de estimados a partir de planos
    app.post('/api/plans/estimate', upload.single('planFile'), this.generateEstimate.bind(this));
    
    // Ruta para prueba de OCR
    app.post('/api/plans/test-ocr', upload.single('planFile'), this.testOcr.bind(this));
    
    console.log('Rutas de ArchitecturalPlanController configuradas');
  }
  
  /**
   * Analiza un plano arquitectónico y extrae información estructurada
   * @param req Solicitud HTTP
   * @param res Respuesta HTTP
   */
  async analyzePlan(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      
      if (!file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }
      
      // Extraer datos del formulario
      const projectType = req.body.projectType || 'general';
      const location: Location = {
        zipCode: req.body.zipCode || '75001',
        city: req.body.city || '',
        state: req.body.state || '',
        country: req.body.country || 'US'
      };
      
      // Verificar tipo de archivo
      const fileExt = path.extname(file.originalname).toLowerCase();
      if (!['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'].includes(fileExt)) {
        res.status(400).json({ 
          error: 'Tipo de archivo no soportado. Formatos soportados: PDF, JPEG, PNG, TIFF' 
        });
        return;
      }
      
      console.log(`Analizando plano: ${file.originalname} (${file.mimetype}), tipo de proyecto: ${projectType}`);
      
      // Procesar el plano
      const result = await this.architecturalPlanEngine.analyzePlan(
        file.path,
        location,
        {
          projectType,
          processingId: `api_${uuidv4()}`
        }
      );
      
      // Limpiar archivo temporal después de procesar
      this.cleanupTempFile(file.path);
      
      // Devolver resultado
      res.json({
        success: true,
        planAnalysis: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Error procesando plano arquitectónico:', error);
      
      // Limpiar archivo temporal en caso de error
      if (req.file) {
        this.cleanupTempFile(req.file.path);
      }
      
      res.status(500).json({
        error: 'Error procesando plano arquitectónico',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Genera un estimado detallado basado en un plano arquitectónico
   * @param req Solicitud HTTP
   * @param res Respuesta HTTP
   */
  async generateEstimate(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      
      if (!file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }
      
      // Extraer datos del formulario
      const projectType = req.body.projectType || 'general';
      const location: Location = {
        zipCode: req.body.zipCode || '75001',
        city: req.body.city || '',
        state: req.body.state || '',
        country: req.body.country || 'US'
      };
      const clientName = req.body.clientName || 'Cliente';
      const additionalNotes = req.body.notes || '';
      const templateStyle = req.body.templateStyle || 'professional';
      
      console.log(`Generando estimado para plano: ${file.originalname}, cliente: ${clientName}`);
      
      // Procesar el plano
      const planAnalysis = await this.architecturalPlanEngine.analyzePlan(
        file.path,
        location,
        {
          projectType,
          processingId: `api_${uuidv4()}`
        }
      );
      
      // Generar estimado detallado con DeepSearch
      const estimate = await this.generateDetailedEstimate(
        planAnalysis,
        {
          projectType,
          location,
          clientName,
          notes: additionalNotes,
          templateStyle,
          planFilename: file.originalname
        }
      );
      
      // Limpiar archivo temporal después de procesar
      this.cleanupTempFile(file.path);
      
      // Devolver resultado
      res.json({
        success: true,
        estimate,
        planAnalysis,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Error generando estimado desde plano:', error);
      
      // Limpiar archivo temporal en caso de error
      if (req.file) {
        this.cleanupTempFile(req.file.path);
      }
      
      res.status(500).json({
        error: 'Error generando estimado desde plano',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Prueba OCR en un plano (endpoint de diagnóstico)
   * @param req Solicitud HTTP
   * @param res Respuesta HTTP
   */
  async testOcr(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      
      if (!file) {
        res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        return;
      }
      
      // Verificar que sea una imagen o PDF
      const fileExt = path.extname(file.originalname).toLowerCase();
      if (!['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'].includes(fileExt)) {
        res.status(400).json({ 
          error: 'Tipo de archivo no soportado. Formatos soportados: PDF, JPEG, PNG, TIFF' 
        });
        return;
      }
      
      // Procesar con OCR (simplificado)
      let extractedText = 'OCR no inicializado';
      
      if (fileExt === '.pdf') {
        // Usar análisis básico de PDF
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text;
      } else {
        // Usar Tesseract para imágenes
        const { createWorker } = require('tesseract.js');
        const worker = await createWorker();
        await worker.loadLanguage('eng+spa');
        await worker.initialize('eng+spa');
        const { data } = await worker.recognize(file.path);
        extractedText = data.text;
        await worker.terminate();
      }
      
      // Limpiar archivo temporal después de procesar
      this.cleanupTempFile(file.path);
      
      // Devolver resultado
      res.json({
        success: true,
        filename: file.originalname,
        extractedText,
        timestamp: new Date().toISOString()
      });
      
    } catch (error: any) {
      console.error('Error en prueba OCR:', error);
      
      // Limpiar archivo temporal en caso de error
      if (req.file) {
        this.cleanupTempFile(req.file.path);
      }
      
      res.status(500).json({
        error: 'Error en prueba OCR',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Genera un estimado detallado utilizando el motor DeepSearch
   */
  private async generateDetailedEstimate(
    planAnalysis: any,
    options: {
      projectType: string;
      location: Location;
      clientName: string;
      notes: string;
      templateStyle: string;
      planFilename: string;
    }
  ): Promise<any> {
    try {
      // Transformar análisis de plano a formato para DeepSearch
      const projectDetails = this.transformPlanToProjectDetails(planAnalysis, options);
      
      // Generar estimado con motor DeepSearch
      const result = await this.deepSearchEngine.generateEstimate(
        projectDetails.projectType,
        projectDetails.projectSubtype,
        projectDetails.dimensions,
        projectDetails.options,
        options.location
      );
      
      // Enriquecer el resultado con datos adicionales
      return {
        ...result,
        clientName: options.clientName,
        projectTitle: `${this.capitalizeFirstLetter(options.projectType)} basado en plano arquitectónico`,
        sourceFile: options.planFilename,
        additionalNotes: options.notes,
        templateStyle: options.templateStyle,
        generatedDate: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error generando estimado detallado:', error);
      throw error;
    }
  }
  
  /**
   * Transforma el análisis de un plano al formato requerido por DeepSearch
   */
  private transformPlanToProjectDetails(
    planAnalysis: any,
    options: {
      projectType: string;
      location: Location;
      clientName: string;
      notes: string;
      templateStyle: string;
      planFilename: string;
    }
  ): any {
    // Mapear tipos de proyecto a subtipos correspondientes
    const projectSubtypeMap: Record<string, string> = {
      'fence': 'custom',
      'deck': 'custom',
      'home': 'custom',
      'adu': 'custom',
      'room_addition': 'custom',
      'remodel': 'custom',
      'general': 'standard'
    };
    
    // Extraer dimensiones del plano
    const dimensions = { ...planAnalysis.dimensions };
    
    // Si no hay dimensiones, usar valores predeterminados
    if (Object.keys(dimensions).length === 0) {
      if (options.projectType === 'fence') {
        dimensions.length = 100;
        dimensions.height = 6;
      } else if (options.projectType === 'deck') {
        dimensions.length = 16;
        dimensions.width = 12;
      } else {
        dimensions.area = planAnalysis.totalArea || 1000;
      }
    }
    
    // Extraer materiales del plano
    const materials: Record<string, string> = {};
    Object.entries(planAnalysis.materials || {}).forEach(([key, value]) => {
      materials[key] = String(value);
    });
    
    // Crear opciones adicionales
    const detailedOptions = {
      materials,
      qualityGrade: 'standard',
      demolitionNeeded: false,
      permitRequired: true,
      elements: this.extractElementOptions(planAnalysis.elements),
      rooms: this.extractRoomOptions(planAnalysis.rooms || []),
      customSpecifications: {}
    };
    
    // Resultado final para DeepSearch
    return {
      projectType: options.projectType,
      projectSubtype: projectSubtypeMap[options.projectType] || 'standard',
      dimensions,
      options: detailedOptions,
      clientInfo: {
        name: options.clientName,
        location: options.location
      },
      source: 'architectural_plan',
      customNotes: options.notes
    };
  }
  
  /**
   * Extrae opciones de elementos arquitectónicos
   */
  private extractElementOptions(elements: Array<any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    elements.forEach(element => {
      if (!element.type) return;
      
      const key = element.type.toLowerCase();
      result[key] = {
        quantity: element.quantity || 1,
        dimensions: element.dimensions || {},
        specifications: element.specifications || {}
      };
    });
    
    return result;
  }
  
  /**
   * Extrae opciones de habitaciones
   */
  private extractRoomOptions(rooms: Array<any>): Array<any> {
    return rooms.map(room => ({
      name: room.name || 'Habitación',
      area: room.area || 0,
      dimensions: room.dimensions || { width: 0, length: 0 }
    }));
  }
  
  /**
   * Capitaliza la primera letra de una cadena
   */
  private capitalizeFirstLetter(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  
  /**
   * Limpia un archivo temporal
   */
  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Error eliminando archivo temporal ${filePath}:`, error);
    }
  }
}