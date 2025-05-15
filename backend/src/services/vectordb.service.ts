import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cosine_similarity } from '../utils/math-utils';

/**
 * Servicio para gestionar la base de datos vectorial utilizada para búsquedas semánticas.
 * Esta implementación simplificada almacena los vectores en el sistema de archivos.
 * En un entorno de producción, se recomendaría usar una DB vectorial especializada como
 * Pinecone, Weaviate, Milvus o similar.
 */
export class VectorDBService {
  private collections: Map<string, any[]> = new Map();
  private collectionsPath: string;
  
  constructor(basePath: string) {
    this.collectionsPath = basePath;
    this.loadCollections();
  }
  
  /**
   * Carga todas las colecciones desde el sistema de archivos
   */
  private async loadCollections(): Promise<void> {
    if (!fs.existsSync(this.collectionsPath)) {
      fs.mkdirSync(this.collectionsPath, { recursive: true });
      return;
    }
    
    const collections = fs.readdirSync(this.collectionsPath)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    
    for (const collection of collections) {
      try {
        const collectionPath = path.join(this.collectionsPath, `${collection}.json`);
        const collectionData = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));
        this.collections.set(collection, collectionData);
        
        console.log(`Loaded collection ${collection} with ${collectionData.length} documents`);
      } catch (error) {
        console.error(`Error loading collection ${collection}:`, error);
      }
    }
  }
  
  /**
   * Guarda una colección en el sistema de archivos
   */
  private async saveCollection(collection: string): Promise<void> {
    const collectionData = this.collections.get(collection) || [];
    const collectionPath = path.join(this.collectionsPath, `${collection}.json`);
    
    try {
      fs.writeFileSync(collectionPath, JSON.stringify(collectionData, null, 2));
    } catch (error) {
      console.error(`Error saving collection ${collection}:`, error);
      throw error;
    }
  }
  
  /**
   * Almacena un vector en la colección especificada
   */
  public async storeVector(
    collection: string, 
    vector: number[], 
    metadata: any
  ): Promise<string> {
    // Inicializar colección si no existe
    if (!this.collections.has(collection)) {
      this.collections.set(collection, []);
    }
    
    // Generar ID único para el documento
    const id = metadata.id || uuidv4();
    
    // Crear documento
    const document = {
      id,
      vector,
      data: metadata,
      timestamp: new Date().toISOString()
    };
    
    // Añadir a la colección
    const collectionData = this.collections.get(collection)!;
    collectionData.push(document);
    
    // Guardar colección
    await this.saveCollection(collection);
    
    return id;
  }
  
  /**
   * Encuentra vectores similares al vector de consulta
   */
  public async findSimilarVectors(
    collection: string,
    queryVector: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<any[]> {
    // Verificar si la colección existe
    if (!this.collections.has(collection)) {
      return [];
    }
    
    const collectionData = this.collections.get(collection)!;
    
    // Calcular similitud con todos los vectores
    const results = collectionData.map(doc => {
      const similarity = cosine_similarity(queryVector, doc.vector);
      return {
        id: doc.id,
        data: doc.data,
        similarity
      };
    });
    
    // Filtrar por umbral y ordenar por similitud descendente
    return results
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
  
  /**
   * Elimina un vector por ID
   */
  public async deleteVector(collection: string, id: string): Promise<boolean> {
    if (!this.collections.has(collection)) {
      return false;
    }
    
    const collectionData = this.collections.get(collection)!;
    const initialLength = collectionData.length;
    
    // Filtrar para eliminar el documento
    const newCollection = collectionData.filter(doc => doc.id !== id);
    
    if (newCollection.length === initialLength) {
      return false; // No se encontró el documento
    }
    
    // Actualizar colección
    this.collections.set(collection, newCollection);
    
    // Guardar colección
    await this.saveCollection(collection);
    
    return true;
  }
  
  /**
   * Obtiene un vector por ID
   */
  public async getVector(collection: string, id: string): Promise<any | null> {
    if (!this.collections.has(collection)) {
      return null;
    }
    
    const collectionData = this.collections.get(collection)!;
    const document = collectionData.find(doc => doc.id === id);
    
    return document || null;
  }
  
  /**
   * Actualiza un vector existente
   */
  public async updateVector(
    collection: string,
    id: string,
    newVector?: number[],
    newMetadata?: any
  ): Promise<boolean> {
    const doc = await this.getVector(collection, id);
    
    if (!doc) {
      return false;
    }
    
    // Actualizar vector y/o metadata
    if (newVector) {
      doc.vector = newVector;
    }
    
    if (newMetadata) {
      doc.data = { ...doc.data, ...newMetadata };
    }
    
    doc.timestamp = new Date().toISOString();
    
    // Guardar colección
    await this.saveCollection(collection);
    
    return true;
  }
  
  /**
   * Obtiene estadísticas sobre las colecciones
   */
  public getStats(): any {
    const stats: Record<string, any> = {};
    
    for (const [collection, data] of this.collections.entries()) {
      stats[collection] = {
        count: data.length,
        lastUpdated: data.length > 0 
          ? new Date(Math.max(...data.map(d => new Date(d.timestamp).getTime())))
          : null
      };
    }
    
    return stats;
  }
}
