import { Request, Response } from 'express';
import { TemplateRenderService } from '../services/template-render.service';
import path from 'path';
import fs from 'fs';

/**
 * Controller handling estimate template rendering
 */
export class TemplateController {
  private templateService: TemplateRenderService;
  
  constructor() {
    this.templateService = new TemplateRenderService();
  }

  /**
   * Renders an estimate using the specified template
   */
  public renderEstimate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { estimateData, templateType, outputFormat } = req.body;
      
      if (!estimateData) {
        res.status(400).json({ error: 'Estimate data is required' });
        return;
      }
      
      // Default to professional template if not specified
      const template = templateType || 'professional';
      // Default to HTML if not specified
      const format = outputFormat || 'html';
      
      let result;
      if (format.toLowerCase() === 'pdf') {
        result = await this.templateService.renderToPdf(estimateData, template);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="estimate-${estimateData.estimate.estimateNumber}.pdf"`);
        res.send(result);
      } else {
        result = await this.templateService.renderToHtml(estimateData, template);
        res.setHeader('Content-Type', 'text/html');
        res.send(result);
      }
    } catch (error) {
      console.error('Error rendering estimate:', error);
      res.status(500).json({ error: 'Failed to render estimate template' });
    }
  };

  /**
   * Get available template types
   */
  public getTemplateTypes = (req: Request, res: Response): void => {
    try {
      const templateTypes = this.templateService.getAvailableTemplates();
      res.json({ templates: templateTypes });
    } catch (error) {
      console.error('Error getting template types:', error);
      res.status(500).json({ error: 'Failed to get template types' });
    }
  };

  /**
   * Preview a template with sample data
   */
  public previewTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { templateType } = req.params;
      
      // Load sample data for preview
      const sampleDataPath = path.join(__dirname, '../templates/sample-data.json');
      const sampleData = JSON.parse(fs.readFileSync(sampleDataPath, 'utf8'));
      
      const result = await this.templateService.renderToHtml(sampleData, templateType);
      res.setHeader('Content-Type', 'text/html');
      res.send(result);
    } catch (error) {
      console.error('Error previewing template:', error);
      res.status(500).json({ error: 'Failed to preview template' });
    }
  };

  /**
   * Generate estimate PDF and store it for later retrieval
   */
  public generateAndStoreEstimatePdf = async (req: Request, res: Response): Promise<void> => {
    try {
      const { estimateData, templateType, filename } = req.body;
      
      if (!estimateData || !filename) {
        res.status(400).json({ error: 'Estimate data and filename are required' });
        return;
      }
      
      // Default to professional template if not specified
      const template = templateType || 'professional';
      
      // Generate PDF
      const pdfBuffer = await this.templateService.renderToPdf(estimateData, template);
      
      // Ensure the output directory exists
      const outputDir = path.join(__dirname, '../../generated-estimates');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save the PDF file
      const outputPath = path.join(outputDir, `${filename}.pdf`);
      fs.writeFileSync(outputPath, pdfBuffer);
      
      res.json({ 
        success: true, 
        message: 'PDF estimate generated and stored successfully',
        filename: `${filename}.pdf`,
        path: outputPath
      });
    } catch (error) {
      console.error('Error generating and storing PDF:', error);
      res.status(500).json({ error: 'Failed to generate and store PDF estimate' });
    }
  };
}