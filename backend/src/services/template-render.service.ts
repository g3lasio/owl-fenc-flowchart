import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as puppeteer from 'puppeteer';

// Tipos de templates disponibles
export enum TemplateType {
  PROFESSIONAL = 'professional',
  MODERN = 'modern',
  RUSTIC = 'rustic',
  MINIMALIST = 'minimalist',
  ELEGANT = 'elegant',
}

// Configuración de colores y fuentes para los templates
interface TemplateConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
}

// Configuraciones predefinidas para cada tipo de template
const templateConfigs: Record<TemplateType, TemplateConfig> = {
  [TemplateType.PROFESSIONAL]: {
    primaryColor: '#2c3e50',
    secondaryColor: '#3498db',
    accentColor: '#e74c3c',
    fontFamily: 'Roboto, sans-serif',
  },
  [TemplateType.MODERN]: {
    primaryColor: '#34495e',
    secondaryColor: '#16a085',
    accentColor: '#f39c12',
    fontFamily: 'Montserrat, sans-serif',
  },
  [TemplateType.RUSTIC]: {
    primaryColor: '#5d4037',
    secondaryColor: '#8d6e63',
    accentColor: '#ff7043',
    fontFamily: 'Merriweather, serif',
  },
  [TemplateType.MINIMALIST]: {
    primaryColor: '#212121',
    secondaryColor: '#757575',
    accentColor: '#03a9f4',
    fontFamily: 'Open Sans, sans-serif',
  },
  [TemplateType.ELEGANT]: {
    primaryColor: '#1a237e',
    secondaryColor: '#283593',
    accentColor: '#880e4f',
    fontFamily: 'Playfair Display, serif',
  },
};

export class TemplateRenderService {
  private templatesDir: string;

  constructor() {
    // Ruta a la carpeta de templates
    this.templatesDir = path.join(__dirname, '../templates');
    
    // Registrar helpers de Handlebars
    this.registerHandlebarsHelpers();
  }

  /**
   * Registra helpers personalizados para Handlebars
   */
  private registerHandlebarsHelpers(): void {
    // Helper para comparar valores
    handlebars.registerHelper('eq', function(arg1, arg2, options) {
      return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
    });
    
    // Helper para formatear moneda
    handlebars.registerHelper('formatCurrency', function(value) {
      if (typeof value !== 'number') {
        value = parseFloat(value);
      }
      return new Intl.NumberFormat('es-US', { 
        style: 'currency', 
        currency: 'USD' 
      }).format(value);
    });
    
    // Helper para formatear fechas
    handlebars.registerHelper('formatDate', function(date) {
      if (!date) return '';
      const dateObj = new Date(date);
      return dateObj.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    });
  }

  /**
   * Carga un template desde el archivo
   * @param templateType Tipo de template a cargar
   * @returns Template compilado de Handlebars
   */
  private async loadTemplate(templateType: TemplateType): Promise<handlebars.TemplateDelegate> {
    const templatePath = path.join(this.templatesDir, `${templateType}.hbs`);
    
    try {
      const templateSource = await fs.promises.readFile(templatePath, 'utf8');
      return handlebars.compile(templateSource);
    } catch (error) {
      console.error(`Error al cargar el template ${templateType}:`, error);
      throw new Error(`No se pudo cargar el template ${templateType}`);
    }
  }

  /**
   * Renderiza un estimado usando un template específico y lo convierte a HTML
   * @param templateType Tipo de template a usar
   * @param data Datos del estimado
   * @returns HTML renderizado
   */
  public async renderToHtml(templateType: TemplateType, data: any): Promise<string> {
    try {
      const template = await this.loadTemplate(templateType);
      
      // Agregar la configuración del template a los datos
      const dataWithConfig = {
        ...data,
        templateConfig: templateConfigs[templateType],
        metadata: {
          templateName: templateType,
          version: '1.0',
          generatedDate: new Date().toLocaleDateString('es-ES')
        }
      };
      
      // Renderizar el HTML
      return template(dataWithConfig);
    } catch (error) {
      console.error('Error al renderizar el template a HTML:', error);
      throw new Error('No se pudo renderizar el template a HTML');
    }
  }

  /**
   * Renderiza un estimado a PDF
   * @param templateType Tipo de template a usar
   * @param data Datos del estimado
   * @param outputPath Ruta donde guardar el PDF (opcional)
   * @returns Buffer con el PDF o ruta al archivo guardado
   */
  public async renderToPdf(
    templateType: TemplateType, 
    data: any, 
    outputPath?: string
  ): Promise<Buffer | string> {
    try {
      // Renderizar a HTML primero
      const html = await this.renderToHtml(templateType, data);
      
      // Configurar Puppeteer
      const browser = await puppeteer.launch({
        headless: 'new', // Usar nueva implementación headless
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Configurar página
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Configurar PDF
      const pdfOptions: puppeteer.PDFOptions = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      };
      
      // Si se especificó una ruta de salida, guardar allí
      if (outputPath) {
        await page.pdf({ ...pdfOptions, path: outputPath });
        await browser.close();
        return outputPath;
      }
      
      // De lo contrario, devolver el buffer
      const pdfBuffer = await page.pdf(pdfOptions);
      await browser.close();
      return pdfBuffer;
    } catch (error) {
      console.error('Error al renderizar el template a PDF:', error);
      throw new Error('No se pudo renderizar el template a PDF');
    }
  }

  /**
   * Obtiene la lista de templates disponibles
   * @returns Lista de templates
   */
  public getAvailableTemplates(): { id: string, name: string, description: string }[] {
    return [
      {
        id: TemplateType.PROFESSIONAL,
        name: 'Profesional',
        description: 'Diseño elegante y profesional con colores corporativos'
      },
      {
        id: TemplateType.MODERN,
        name: 'Moderno',
        description: 'Estilo limpio y contemporáneo con toques de color'
      },
      {
        id: TemplateType.RUSTIC,
        name: 'Rústico',
        description: 'Estilo cálido con tonos tierra, ideal para contratistas de madera y estructuras tradicionales'
      },
      {
        id: TemplateType.MINIMALIST,
        name: 'Minimalista',
        description: 'Diseño simplificado y limpio con mucho espacio en blanco'
      },
      {
        id: TemplateType.ELEGANT,
        name: 'Elegante',
        description: 'Diseño sofisticado con detalles refinados para proyectos de alta gama'
      }
    ];
  }

  /**
   * Permite personalizar un template con colores y fuentes específicas
   * @param templateType Tipo de template base
   * @param customConfig Configuración personalizada
   * @returns La configuración personalizada
   */
  public customizeTemplate(
    templateType: TemplateType, 
    customConfig: Partial<TemplateConfig>
  ): TemplateConfig {
    return {
      ...templateConfigs[templateType],
      ...customConfig
    };
  }
}