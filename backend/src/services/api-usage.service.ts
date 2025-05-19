import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

/**
 * Servicio para monitorear el uso de API y evitar costos excesivos
 */
export class ApiUsageService {
  private usagePath: string;
  private usageData: {
    openai: {
      calls: number;
      tokens: number;
      lastReset: string;
      monthlyCap: number;
    };
    anthropic: {
      calls: number;
      tokens: number;
      lastReset: string;
      monthlyCap: number;
    };
  } = {
    openai: {
      calls: 0,
      tokens: 0,
      lastReset: new Date().toISOString().split('T')[0],
      monthlyCap: 1000000
    },
    anthropic: {
      calls: 0,
      tokens: 0,
      lastReset: new Date().toISOString().split('T')[0],
      monthlyCap: 1000000
    }
  };
  
  constructor(usageFolder: string = 'usage') {
    // Crear directorio de uso si no existe
    this.usagePath = path.join(process.cwd(), usageFolder);
    if (!fs.existsSync(this.usagePath)) {
      fs.mkdirSync(this.usagePath, { recursive: true });
    }
    
    // Inicializar datos de uso o cargar existentes
    this.loadUsageData();
    
    // Comprobar si debemos reiniciar el contador mensual
    this.checkMonthlyReset();
  }
  
  /**
   * Generic logger for API usage
   */
  logAPIUsage(
    provider: string,
    operationType: string,
    details: { model?: string; promptLength?: number }
  ): void {
    // Determine which provider to log for
    if (provider === 'openai') {
      const estimatedTokens = details.promptLength ? Math.ceil(details.promptLength / 4) : 0;
      this.logOpenAIUsage(estimatedTokens, 0);
    } else if (provider === 'anthropic') {
      const estimatedTokens = details.promptLength ? Math.ceil(details.promptLength / 4) : 0;
      this.logAnthropicUsage(estimatedTokens, 0);
    } else {
      console.log(`API usage logged for provider: ${provider}, operation: ${operationType}, model: ${details.model || 'unknown'}`);
    }
  }
  
  /**
   * Registra uso de la API de OpenAI
   */
  logOpenAIUsage(promptTokens: number, completionTokens: number): void {
    this.usageData.openai.calls += 1;
    this.usageData.openai.tokens += (promptTokens + completionTokens);
    this.saveUsageData();
    
    // Comprobar si excedemos el límite
    this.checkOpenAIUsageLimits();
  }
  
  /**
   * Registra uso de la API de Anthropic
   */
  logAnthropicUsage(promptTokens: number, completionTokens: number): void {
    this.usageData.anthropic.calls += 1;
    this.usageData.anthropic.tokens += (promptTokens + completionTokens);
    this.saveUsageData();
    
    // Comprobar si excedemos el límite
    this.checkAnthropicUsageLimits();
  }
  
  /**
   * Obtiene estadísticas de uso
   */
  getUsageStats(): any {
    return {
      openai: {
        calls: this.usageData.openai.calls,
        tokens: this.usageData.openai.tokens,
        estimatedCost: this.calculateOpenAICost(this.usageData.openai.tokens),
        lastReset: this.usageData.openai.lastReset,
        usagePercent: (this.usageData.openai.tokens / this.usageData.openai.monthlyCap) * 100
      },
      anthropic: {
        calls: this.usageData.anthropic.calls,
        tokens: this.usageData.anthropic.tokens,
        estimatedCost: this.calculateAnthropicCost(this.usageData.anthropic.tokens),
        lastReset: this.usageData.anthropic.lastReset,
        usagePercent: (this.usageData.anthropic.tokens / this.usageData.anthropic.monthlyCap) * 100
      }
    };
  }
  
  /**
   * Verifica si es seguro usar OpenAI (no excedemos límites)
   */
  isSafeToUseOpenAI(): boolean {
    return this.usageData.openai.tokens < this.usageData.openai.monthlyCap;
  }
  
  /**
   * Verifica si es seguro usar Anthropic (no excedemos límites)
   */
  isSafeToUseAnthropic(): boolean {
    return this.usageData.anthropic.tokens < this.usageData.anthropic.monthlyCap;
  }
  
  /**
   * Estima el costo en USD para OpenAI
   */
  private calculateOpenAICost(tokens: number): number {
    // Precios aproximados por 1000 tokens (puede cambiar según el modelo)
    const promptPrice = 0.01; // $0.01 por 1000 tokens de prompt (GPT-4)
    const completionPrice = 0.03; // $0.03 por 1000 tokens de completion (GPT-4)
    
    // Asumimos una proporción 70/30 entre prompt y completion
    const promptTokens = tokens * 0.7;
    const completionTokens = tokens * 0.3;
    
    return ((promptTokens / 1000) * promptPrice) + ((completionTokens / 1000) * completionPrice);
  }
  
  /**
   * Estima el costo en USD para Anthropic
   */
  private calculateAnthropicCost(tokens: number): number {
    // Precios aproximados por 1000 tokens (puede cambiar según el modelo)
    const price = 0.015; // $0.015 por 1000 tokens (Claude)
    
    return (tokens / 1000) * price;
  }
  
  /**
   * Verifica si excedemos límites de OpenAI
   */
  private checkOpenAIUsageLimits(): void {
    const usagePercent = (this.usageData.openai.tokens / this.usageData.openai.monthlyCap) * 100;
    
    if (usagePercent >= 90) {
      console.warn(`⚠️ ALERTA: Uso de OpenAI al ${usagePercent.toFixed(1)}% del límite mensual`);
    }
    
    if (usagePercent >= 100) {
      console.error(`🛑 EMERGENCIA: Excedido límite mensual de OpenAI (${this.usageData.openai.tokens} tokens)`);
    }
  }
  
  /**
   * Verifica si excedemos límites de Anthropic
   */
  private checkAnthropicUsageLimits(): void {
    const usagePercent = (this.usageData.anthropic.tokens / this.usageData.anthropic.monthlyCap) * 100;
    
    if (usagePercent >= 90) {
      console.warn(`⚠️ ALERTA: Uso de Anthropic al ${usagePercent.toFixed(1)}% del límite mensual`);
    }
    
    if (usagePercent >= 100) {
      console.error(`🛑 EMERGENCIA: Excedido límite mensual de Anthropic (${this.usageData.anthropic.tokens} tokens)`);
    }
  }
  
  /**
   * Carga datos de uso desde el disco
   */
  private loadUsageData(): void {
    const usageFilePath = path.join(this.usagePath, 'api-usage.json');
    
    if (fs.existsSync(usageFilePath)) {
      try {
        const data = fs.readFileSync(usageFilePath, 'utf8');
        this.usageData = JSON.parse(data);
        console.log('Datos de uso de API cargados');
      } catch (error) {
        console.error('Error al cargar datos de uso de API:', error);
        this.initializeDefaultUsageData();
      }
    } else {
      this.initializeDefaultUsageData();
    }
  }
  
  /**
   * Inicializa datos de uso predeterminados
   */
  private initializeDefaultUsageData(): void {
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    this.usageData = {
      openai: {
        calls: 0,
        tokens: 0,
        lastReset: currentDate,
        monthlyCap: 1000000 // 1 millón de tokens por mes
      },
      anthropic: {
        calls: 0,
        tokens: 0,
        lastReset: currentDate,
        monthlyCap: 1000000 // 1 millón de tokens por mes
      }
    };
    
    this.saveUsageData();
  }
  
  /**
   * Guarda datos de uso en disco
   */
  private saveUsageData(): void {
    try {
      fs.writeFileSync(
        path.join(this.usagePath, 'api-usage.json'),
        JSON.stringify(this.usageData, null, 2)
      );
    } catch (error) {
      console.error('Error al guardar datos de uso de API:', error);
    }
  }
  
  /**
   * Verifica si debemos reiniciar los contadores mensuales
   */
  private checkMonthlyReset(): void {
    const currentDate = new Date();
    const lastResetDate = new Date(this.usageData.openai.lastReset);
    
    // Si estamos en un mes diferente, reiniciar contadores
    if (currentDate.getMonth() !== lastResetDate.getMonth() || 
        currentDate.getFullYear() !== lastResetDate.getFullYear()) {
      
      this.resetMonthlyCounters();
    }
  }
  
  /**
   * Reinicia contadores mensuales
   */
  private resetMonthlyCounters(): void {
    const currentDate = new Date().toISOString().split('T')[0];
    
    this.usageData.openai.calls = 0;
    this.usageData.openai.tokens = 0;
    this.usageData.openai.lastReset = currentDate;
    
    this.usageData.anthropic.calls = 0;
    this.usageData.anthropic.tokens = 0;
    this.usageData.anthropic.lastReset = currentDate;
    
    this.saveUsageData();
    console.log('Contadores mensuales de API reiniciados');
  }
}