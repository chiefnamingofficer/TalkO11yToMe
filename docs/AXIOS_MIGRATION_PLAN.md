# Axios Migration Plan

## 🎯 **Overview**

Migrate all HTTP requests from native `fetch` to `axios` for improved error handling, request/response interceptors, and better developer experience.

---

## 📊 **Current State Analysis**

### **Tools Using HTTP Requests**
1. **`grail-log-query.js`** - OAuth + DQL polling
2. **`grail-business-analytics.js`** - OAuth + DQL queries  
3. **`classic-log-query.js`** - Problems/Events/Entities APIs
4. **`classic-api-client.js`** - Multiple API endpoints
5. **`dynatrace-oauth-tool.js`** - OAuth token generation
6. **`dynatrace-monitor.js`** - Status checking

### **Current HTTP Patterns**
```javascript
// Pattern 1: OAuth requests
const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
});

// Pattern 2: API requests with Bearer token
const response = await fetch(url, {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }
});

// Pattern 3: DQL polling
const response = await fetch(pollUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## 🚀 **Axios Implementation Plan**

### **Phase 1: Setup & Configuration**

#### **1. Install axios**
```bash
npm install axios
```

#### **2. Create HTTP client module** (`lib/http-client.js`)
```javascript
const axios = require('axios');

// Create base instance with common configuration
const httpClient = axios.create({
    timeout: 30000,
    headers: {
        'User-Agent': 'TalkO11yToMe/1.0'
    }
});

// Request interceptor for logging
httpClient.interceptors.request.use(
    (config) => {
        console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for error handling
httpClient.interceptors.response.use(
    (response) => {
        console.log(`📥 ${response.status} ${response.config.url} (${response.data?.length || 0} bytes)`);
        return response;
    },
    (error) => {
        console.error(`❌ HTTP Error: ${error.message}`);
        return Promise.reject(error);
    }
);

module.exports = { httpClient };
```

### **Phase 2: OAuth Client** (`lib/oauth-client.js`)
```javascript
const { httpClient } = require('./http-client');

class OAuthClient {
    constructor(clientId, clientSecret, resourceUrn) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.resourceUrn = resourceUrn;
        this.tokenCache = null;
        this.tokenExpiry = null;
    }

    async getToken() {
        // Check if token is still valid
        if (this.tokenCache && this.tokenExpiry > Date.now()) {
            return this.tokenCache;
        }

        try {
            const response = await httpClient.post(
                `${this.getEnvironmentUrl()}/sso/oauth2/token`,
                new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    resource: this.resourceUrn,
                    scope: 'storage:logs:read storage:events:read storage:problems:read'
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.tokenCache = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 30000; // 30s buffer
            
            return this.tokenCache;
        } catch (error) {
            throw new Error(`OAuth failed: ${error.response?.data?.error || error.message}`);
        }
    }

    // Create authenticated HTTP client
    async createAuthenticatedClient() {
        const token = await this.getToken();
        
        return axios.create({
            timeout: 30000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    }
}

module.exports = { OAuthClient };
```

### **Phase 3: DQL Client** (`lib/dql-client.js`)
```javascript
const { OAuthClient } = require('./oauth-client');

class DQLClient extends OAuthClient {
    async executeQuery(query, timeout = 30000) {
        const client = await this.createAuthenticatedClient();
        
        try {
            // Submit query
            const submitResponse = await client.post(
                `${this.getEnvironmentUrl()}/platform/classic/environment-api/v2/dql/query`,
                { query }
            );

            const requestToken = submitResponse.data.requestToken;
            
            // Poll for results
            return await this.pollForResults(client, requestToken, timeout);
        } catch (error) {
            throw new Error(`DQL query failed: ${error.response?.data?.message || error.message}`);
        }
    }

    async pollForResults(client, requestToken, timeout) {
        const startTime = Date.now();
        const pollInterval = 2000; // 2 seconds
        
        while (Date.now() - startTime < timeout) {
            try {
                const pollResponse = await client.get(
                    `${this.getEnvironmentUrl()}/platform/classic/environment-api/v2/dql/query/${requestToken}`
                );

                const { state, result } = pollResponse.data;

                if (state === 'SUCCEEDED') {
                    return result;
                } else if (state === 'FAILED') {
                    throw new Error('Query execution failed');
                }

                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            } catch (error) {
                throw new Error(`Polling failed: ${error.response?.data?.message || error.message}`);
            }
        }

        throw new Error('Query timeout');
    }
}

module.exports = { DQLClient };
```

---

## 🔧 **Migration Strategy**

### **Tool-by-Tool Migration**

#### **1. Start with `dynatrace-oauth-tool.js`** (Simplest)
- Replace fetch with axios for OAuth requests
- Test token generation and validation
- Verify error handling improvements

#### **2. Migrate `classic-api-client.js`** (Most complex)
- Multiple API endpoints
- Different authentication methods
- Good test case for interceptors

#### **3. Update DQL tools** (`grail-log-query.js`, `grail-business-analytics.js`)
- Use new DQLClient class
- Test polling improvements
- Verify OAuth integration

#### **4. Finish with monitoring tools**
- `dynatrace-monitor.js`
- `classic-log-query.js`

### **Testing Strategy**
1. **Unit tests**: Test each HTTP client class
2. **Integration tests**: Full tool execution
3. **Regression tests**: Compare with fetch-based results
4. **Performance tests**: Measure request timing improvements

---

## 📈 **Expected Benefits**

### **Error Handling**
```javascript
// Before (fetch)
if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

// After (axios)
// Automatic error throwing for 4xx/5xx status codes
// Detailed error objects with request/response data
```

### **Request/Response Interceptors**
```javascript
// Automatic logging
// Token refresh handling
// Request timing
// Error standardization
```

### **Configuration**
```javascript
// Base URLs per environment
// Default headers
// Timeout configuration
// Retry logic
```

---

## 🎯 **Implementation Checklist**

### **Setup**
- [ ] Install axios dependency
- [ ] Create `lib/http-client.js`
- [ ] Create `lib/oauth-client.js`
- [ ] Create `lib/dql-client.js`

### **Migration**
- [ ] Migrate `dynatrace-oauth-tool.js`
- [ ] Test OAuth functionality
- [ ] Migrate `classic-api-client.js`
- [ ] Test API client features
- [ ] Migrate `grail-log-query.js`
- [ ] Test DQL polling
- [ ] Migrate `grail-business-analytics.js`
- [ ] Test business analytics
- [ ] Migrate remaining tools
- [ ] Update shared config integration

### **Testing**
- [ ] Create axios-specific tests
- [ ] Run full test suite
- [ ] Performance comparison
- [ ] Error handling validation

### **Documentation**
- [ ] Update tool documentation
- [ ] Add HTTP client guide
- [ ] Update troubleshooting docs

---

## 🔮 **Future Enhancements**

### **Advanced Features**
- **Request caching**: Cache GET requests for performance
- **Request queueing**: Rate limit compliance
- **Circuit breaker**: Fail fast on repeated errors
- **Metrics collection**: Request timing and success rates

### **Configuration Options**
- **Retry strategies**: Exponential backoff, max retries
- **Timeout hierarchies**: Global, per-tool, per-request
- **Environment profiles**: Different configs per environment

---

**🚀 Ready to start**: Begin with axios installation and basic HTTP client setup

**🎯 First milestone**: Successfully migrate OAuth tool with improved error handling

**📊 Success metrics**: Better error messages, request logging, simplified code** 