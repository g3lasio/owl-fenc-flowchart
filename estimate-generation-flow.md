
# Estimate Generation Flow
This document details the complete flow of the estimate generation system, both for manual mode and AI-assisted mode (Mervin).

## 1. General Architecture

### 1.1 Main Services
- `EstimatorService`: Handles central estimation logic
- `PromptGeneratorService`: Generates and processes prompts for Mervin
- `DatabaseStorage`: Data access and persistence
- `MaterialService`: Price and materials management

### 1.2 API Endpoints
```
POST /api/estimates/calculate
POST /api/estimates/validate  
POST /api/estimates/html
POST /api/estimates/save
POST /api/estimates/email
```

## 2. Data Flow

### 2.1 Contractor Data Collection
1. Verify active contractor session
2. Load profile from `storage.getUser(userId)`
3. Required data:
   - Contractor ID
   - Name/Company
   - Address
   - Phone
   - Email
   - License
   - Logo

### 2.2 Client Validation
1. Search for existing client or create new
2. Required data:
   - Full name
   - Email
   - Phone
   - Project address
   - City
   - State
   - Zip code

### 2.3 Project Information
1. Project type (fence, roof, etc.)
2. Subtype (specific material)
3. Dimensions by type:
   - Fence: length and height
   - Roof: area
   - Deck: area or length/width
4. Additional features:
   - Demolition
   - Finishes
   - Special features

## 3. Manual Estimation Process

### 3.1 Materials Calculation
1. Consult `materialParameters.json` for base rules
2. Calculate quantities by type:
   ```typescript
   const materials = {
     posts: calculatePosts(length, height),
     concrete: calculateConcrete(posts),
     rails: calculateRails(length),
     pickets: calculatePickets(length),
     hardware: calculateHardware()
   };
   ```

### 3.2 Price Consultation
1. Load base prices from DB
2. Apply adjustment factors:
   - State/region
   - Height
   - Special features
3. Calculate subtotals by category

### 3.3 Labor Cost Calculation
1. Consult base rates by state
2. Apply multipliers:
   - Project complexity
   - Height
   - Demolition
3. Calculate estimated hours and total cost

## 4. Process with Mervin (AI)

### 4.1 Prompt Generation
1. Get base template by project type
2. Incorporate specific data:
   - Dimensions
   - Materials
   - Special requirements
3. Include local context:
   - Current prices
   - Regulations
   - Climate factors

### 4.2 AI Processing
1. Send prompt to OpenAI
2. Process structured response:
   ```json
   {
     "materials": [
       {"item": "string", "quantity": number, "cost": number}
     ],
     "labor": {
       "hours": number,
       "rate": number,
       "total": number
     },
     "additional": [...],
     "totals": {...}
   }
   ```

### 4.3 Validation and Adjustment
1. Verify reasonable ranges
2. Apply business rules
3. Adjust based on historical feedback

## 5. Final Estimate Generation

### 5.1 Document Structure
1. Contractor information
2. Client data
3. Project details
4. Materials breakdown
5. Labor costs
6. Additional features
7. Totals and terms

### 5.2 Persistence
1. Save to DB:
   ```typescript
   const projectData = {
     projectId: generateId(),
     clientId: client.id,
     contractorId: contractor.id,
     estimateDetails: {...},
     status: 'draft',
     createdAt: new Date()
   };
   ```

### 5.3 Post-Generation Actions
1. Generate PDF
2. Send email (optional)
3. Update history
4. Notify contractor

## 6. Database Integration

### 6.1 Main Tables
```sql
CREATE TABLE estimates (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR,
  contractor_id INTEGER,
  client_id INTEGER,
  estimate_data JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE materials (
  id SERIAL PRIMARY KEY,
  category VARCHAR,
  name VARCHAR,
  current_price DECIMAL,
  unit VARCHAR
);

CREATE TABLE labor_rates (
  id SERIAL PRIMARY KEY,
  state VARCHAR,
  project_type VARCHAR,
  base_rate DECIMAL,
  updated_at TIMESTAMP
);
```

### 6.2 Main Queries
1. Current material prices
2. Labor rates by region
3. Similar estimates history
4. Local adjustment factors

## 7. Error Handling

### 7.1 Validations
1. Complete input data
2. Valid dimension ranges
3. Material availability
4. User permissions

### 7.2 Recovery
1. Automatic draft saving
2. Error logging
3. Administrator notifications
4. Automatic retries

## 8. Metrics and Monitoring

### 8.1 KPIs
1. Generation time
2. Conversion rate
3. Accuracy vs. actual costs
4. Usage of each mode (manual vs. AI)

### 8.2 Logs
1. Errors and exceptions
2. Response times
3. Resource usage
4. Usage patterns

## 9. Security Considerations

### 9.1 Authentication
1. Verify active session
2. Validate permissions
3. Log accesses

### 9.2 Sensitive Data
1. Encrypt client information
2. Protect prices and margins
3. Limit estimate access

## 10. Optimizations

### 10.1 Cache
1. Material prices
2. Regional rates
3. Frequent templates

### 10.2 Performance
1. Optimized queries
2. Background processing
3. Data compression
