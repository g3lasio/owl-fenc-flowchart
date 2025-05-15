import mongoose from 'mongoose';
import { config } from '../config/config';
import { EventEmitter } from 'events';

/**
 * Servicio para gestionar conexiones a bases de datos con capacidades de retry
 * y manejo de eventos de conexión
 */
export class DatabaseService extends EventEmitter {
  private static instance: DatabaseService;
  private connectionString: string;
  private options: mongoose.ConnectOptions;
  private isConnected: boolean = false;
  private connectionRetries: number = 0;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 5000;
  
  private constructor() {
    super();
    this.configureConnection();
  }
  
  /**
   * Obtiene la instancia singleton del servicio de base de datos
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }
  
  /**
   * Configura los parámetros de conexión a la base de datos
   */
  private configureConnection(): void {
    // Construir connection string desde config
    const { host, port, name, user, password } = config.database;
    
    if (user && password) {
      this.connectionString = `mongodb://${user}:${password}@${host}:${port}/${name}`;
    } else {
      this.connectionString = `mongodb://${host}:${port}/${name}`;
    }
    
    // Opciones de conexión
    this.options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: config.environment === 'development',
      maxPoolSize: 10
    };
  }
  
  /**
   * Establece conexión con la base de datos
   */
  public async connect(): Promise<mongoose.Connection> {
    try {
      if (this.isConnected) {
        console.log('Using existing database connection');
        return mongoose.connection;
      }
      
      console.log(`Connecting to MongoDB at ${config.database.host}:${config.database.port}/${config.database.name}`);
      
      await mongoose.connect(this.connectionString, this.options);
      
      mongoose.connection.on('connected', () => {
        this.isConnected = true;
        this.connectionRetries = 0;
        console.log('Database connection established successfully');
        this.emit('connected');
      });
      
      mongoose.connection.on('error', (err) => {
        console.error('Database connection error:', err);
        this.emit('error', err);
      });
      
      mongoose.connection.on('disconnected', () => {
        this.isConnected = false;
        console.log('Database connection lost');
        this.emit('disconnected');
        this.retryConnection();
      });
      
      return mongoose.connection;
    } catch (error) {
      console.error('Failed to connect to database:', error);
      this.emit('error', error);
      this.retryConnection();
      throw error;
    }
  }
  
  /**
   * Reintentar conexión a la base de datos tras un fallo
   */
  private retryConnection(): void {
    if (this.connectionRetries < this.MAX_RETRIES) {
      this.connectionRetries++;
      
      console.log(`Retrying database connection (${this.connectionRetries}/${this.MAX_RETRIES}) in ${this.RETRY_DELAY_MS / 1000} seconds...`);
      
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Retry connection failed:', err);
        });
      }, this.RETRY_DELAY_MS);
    } else {
      console.error('Max connection retries reached. Please check database configuration.');
      this.emit('max_retries_reached');
    }
  }
  
  /**
   * Cierra la conexión a la base de datos
   */
  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      this.isConnected = false;
      console.log('Database connection closed');
      this.emit('disconnected');
    }
  }
  
  /**
   * Verifica el estado de la conexión
   */
  public isConnectedToDatabase(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
  
  /**
   * Ejecuta health check de la base de datos
   */
  public async healthCheck(): Promise<{ status: string, details?: any }> {
    try {
      if (!this.isConnectedToDatabase()) {
        return { status: 'error', details: 'Not connected to database' };
      }
      
      // Ejecutar comando simple para verificar responsividad
      const adminDb = mongoose.connection.db.admin();
      const result = await adminDb.ping();
      
      if (result && result.ok === 1) {
        return { status: 'ok' };
      } else {
        return { status: 'error', details: 'Database ping failed' };
      }
    } catch (error) {
      return { 
        status: 'error', 
        details: error instanceof Error ? error.message : 'Unknown database error' 
      };
    }
  }
}
