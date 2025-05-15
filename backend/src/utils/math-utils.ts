/**
 * Calcula la similitud de coseno entre dos vectores
 * Esta medida es útil para determinar la similitud semántica entre embeddings
 */
export function cosine_similarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Los vectores deben tener la misma longitud');
  }
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);
  
  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }
  
  return dotProduct / (mag1 * mag2);
}

/**
 * Calcula la distancia euclidiana entre dos vectores
 */
export function euclidean_distance(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Los vectores deben tener la misma longitud');
  }
  
  let sum = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Normaliza un vector para que tenga una magnitud de 1
 */
export function normalize_vector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude === 0) {
    return vec.map(() => 0);
  }
  
  return vec.map(val => val / magnitude);
}

/**
 * Calcula el promedio de un array de vectores
 */
export function average_vectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    return [];
  }
  
  const dimensions = vectors[0].length;
  const result = new Array(dimensions).fill(0);
  
  for (const vec of vectors) {
    if (vec.length !== dimensions) {
      throw new Error('Todos los vectores deben tener la misma dimensión');
    }
    
    for (let i = 0; i < dimensions; i++) {
      result[i] += vec[i];
    }
  }
  
  return result.map(val => val / vectors.length);
}

/**
 * Realiza la ponderación de la similitud por factores adicionales
 * Permite ajustar el scoring basado en otros criterios además de la similitud vectorial
 */
export function weighted_similarity(
  similarity: number, 
  factors: Record<string, number>, 
  weights: Record<string, number>
): number {
  let baseWeight = 0.6; // Peso base para la similitud vectorial
  let weightSum = baseWeight;
  let score = similarity * baseWeight;
  
  // Aplicar pesos adicionales
  for (const [factor, value] of Object.entries(factors)) {
    if (weights[factor]) {
      const factorWeight = weights[factor];
      score += value * factorWeight;
      weightSum += factorWeight;
    }
  }
  
  // Normalizar resultado a [0, 1]
  return Math.min(1, Math.max(0, score / weightSum));
}
