/**
 * Interfaz interactiva para probar el cliente de Mistral AI OCR
 * Esta herramienta permite subir imágenes y probar las funcionalidades de OCR
 * y análisis de planos de forma interactiva
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../src/config/config';
import { MistralAIClient } from '../src/services/mistral.client';

// Configuración de Express
const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único con timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB límite
  },
  fileFilter: function(req, file, cb) {
    // Validar tipos de archivo
    const filetypes = /jpeg|jpg|png|pdf|tiff|tif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    
    cb(new Error('Error: Solo se permiten imágenes (jpeg, jpg, png, tiff) y PDFs'));
  }
});

// Configurar motor de vistas y archivos estáticos
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cliente de Mistral (inicializado bajo demanda)
let mistralClient: MistralAIClient | null = null;

// Páginas
app.get('/', (req, res) => {
  const hasApiKey = !!config.mistral?.apiKey;
  res.render('index', { 
    hasApiKey,
    error: null,
    results: null
  });
});

app.post('/api-key', (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.render('index', { 
      hasApiKey: false,
      error: 'Por favor ingresa una API key válida',
      results: null
    });
  }
  
  // Almacenar temporalmente (solo en memoria)
  config.mistral = {
    ...config.mistral,
    apiKey
  };
  
  // Inicializar cliente
  mistralClient = new MistralAIClient(apiKey);
  
  res.redirect('/');
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    // Verificar si hay cliente y API key
    if (!mistralClient || !config.mistral?.apiKey) {
      return res.render('index', { 
        hasApiKey: false,
        error: 'API key no configurada',
        results: null
      });
    }
    
    // Verificar archivo
    if (!req.file) {
      return res.render('index', { 
        hasApiKey: true,
        error: 'No se subió ningún archivo',
        results: null
      });
    }
    
    const imageBuffer = fs.readFileSync(req.file.path);
    const options = req.body;
    
    // Resultados
    const results: any = {
      filename: req.file.originalname,
      filepath: `/uploads/${path.basename(req.file.path)}`,
      size: `${(req.file.size / 1024).toFixed(2)} KB`,
      timestamp: new Date().toLocaleString(),
      ocrBasic: null,
      ocrDetailed: null,
      blueprintAnalysis: null,
      processingTime: {
        ocrBasic: 0,
        ocrDetailed: 0,
        blueprintAnalysis: 0
      }
    };
    
    // Realizar operaciones solicitadas
    const tasks = [];
    
    // OCR Básico
    if (options.runBasicOcr) {
      const basicOcrTask = async () => {
        const startTime = Date.now();
        const ocrResult = await mistralClient!.performOCR({
          imageBuffer,
          detailed: false
        });
        results.processingTime.ocrBasic = Date.now() - startTime;
        results.ocrBasic = ocrResult;
      };
      tasks.push(basicOcrTask());
    }
    
    // OCR Detallado
    if (options.runDetailedOcr) {
      const detailedOcrTask = async () => {
        const startTime = Date.now();
        const detailedResult = await mistralClient!.performOCR({
          imageBuffer,
          detailed: true
        });
        results.processingTime.ocrDetailed = Date.now() - startTime;
        results.ocrDetailed = detailedResult;
      };
      tasks.push(detailedOcrTask());
    }
    
    // Análisis de plano
    if (options.runBlueprintAnalysis) {
      const blueprintTask = async () => {
        const startTime = Date.now();
        const analysisResult = await mistralClient!.analyzeBlueprintImage({
          imageBuffer,
          projectType: options.projectType || 'general',
          outputFormat: 'json'
        });
        results.processingTime.blueprintAnalysis = Date.now() - startTime;
        results.blueprintAnalysis = typeof analysisResult === 'object' 
          ? JSON.stringify(analysisResult, null, 2)
          : analysisResult;
      };
      tasks.push(blueprintTask());
    }
    
    // Ejecutar tareas en paralelo si es posible
    await Promise.all(tasks);
    
    res.render('index', {
      hasApiKey: true,
      error: null,
      results
    });
    
  } catch (error: any) {
    console.error('Error en procesamiento:', error);
    res.render('index', {
      hasApiKey: !!config.mistral?.apiKey,
      error: `Error: ${error.message || 'Error desconocido'}`,
      results: null
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Interfaz de prueba iniciada en http://localhost:${PORT}`);
});