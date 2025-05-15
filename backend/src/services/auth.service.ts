import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/config';

/**
 * Servicio de autenticación y autorización para la aplicación
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly tokenExpiration: string;
  
  constructor() {
    this.jwtSecret = config.security.jwtSecret || 'owl-fenc-super-secret-key';
    this.tokenExpiration = config.security.tokenExpiration || '24h';
  }
  
  /**
   * Genera un hash seguro de una contraseña
   */
  public async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }
  
  /**
   * Verifica una contraseña contra su hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  
  /**
   * Genera un token JWT
   */
  public generateToken(
    userId: string, 
    role: string = 'user', 
    additionalData: Record<string, any> = {}
  ): string {
    const payload = {
      sub: userId,
      role,
      ...additionalData,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiration
    });
  }
  
  /**
   * Verifica y decodifica un token JWT
   */
  public verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
  
  /**
   * Extrae el token de los headers de la petición
   */
  public extractTokenFromHeaders(headers: Record<string, any>): string | null {
    const authHeader = headers.authorization;
    
    if (!authHeader) {
      return null;
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }
  
  /**
   * Verifica si un usuario tiene un rol específico
   */
  public hasRole(decodedToken: any, requiredRole: string | string[]): boolean {
    if (!decodedToken || !decodedToken.role) {
      return false;
    }
    
    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(decodedToken.role);
    }
    
    return decodedToken.role === requiredRole;
  }
  
  /**
   * Genera un token de actualización (refresh token)
   */
  public generateRefreshToken(userId: string): string {
    const payload = {
      sub: userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };
    
    // Los refresh tokens típicamente tienen una expiración más larga
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d'
    });
  }
  
  /**
   * Refresca un token expirado usando un refresh token
   */
  public refreshAuthToken(refreshToken: string): { token: string, refreshToken: string } {
    try {
      const decoded = this.verifyToken(refreshToken);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }
      
      const userId = decoded.sub;
      const newToken = this.generateToken(userId, decoded.role || 'user');
      const newRefreshToken = this.generateRefreshToken(userId);
      
      return { token: newToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }
}
