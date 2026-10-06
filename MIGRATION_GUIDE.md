# faxios Migration Guide

> **Migrating from faxios 0.x to 1.x**
> 
> This guide helps developers upgrade from faxios 0.x to 1.x by documenting breaking changes, providing migration strategies, and offering solutions to common upgrade challenges.

## Table of Contents

- [Fetch-Only Migration (next major)](#fetch-only-migration-next-major)
- [Overview](#overview)
- [Breaking Changes](#breaking-changes)
- [Error Handling Migration](#error-handling-migration)
- [API Changes](#api-changes)
- [Configuration Changes](#configuration-changes)
- [Migration Strategies](#migration-strategies)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Resources](#resources)

## Fetch-Only Migration (next major)

> **This is the next major release.** faxios now uses the web-standard `fetch` API as its **only** HTTP transport in every runtime (browser, Node 18+, Deno, Bun). The legacy adapters and their HTTP-stack dependencies were removed. If you used Node-specific transport options, you must change your code.

### What changed at a glance

| Area | Before | Now |
|------|--------|-----|
| Node transport | `http`/`https` adapter (`follow-redirects`, `form-data`, `proxy-from-env`, `https-proxy-agent`) | web-standard `fetch` |
| Browser transport | `XMLHttpRequest` (xhr) adapter | web-standard `fetch` |
| Package format | (see ESM-only note below) | ESM-only, no CJS / no UMD |
| Upload progress | `onUploadProgress` | removed (fetch cannot emit it) |
| Download progress | `onDownloadProgress` | still supported |
| Connection-refused error code | `ECONNREFUSED` | `ERR_NETWORK` (OS error on `error.cause`) |

### a) Node `http`/`https` adapter removed

All requests in all runtimes now go through `fetch`. There is no `http`/`https` adapter and no `transport` selection. Node 18+ (which ships a global `fetch`) is required.

### b) Browser XHR adapter removed

The `XMLHttpRequest` adapter is gone. Browsers use `fetch`. The default adapter list is `['fetch']`; custom user-supplied adapters are still supported via `adapter`.

### c) ESM-only — no CJS build, no UMD/CDN bundle

faxios ships as ESM only, built by `zshy`. Use `import faxios from 'faxios'`. `require('faxios')` works only through Node's ESM interop; there is no dedicated CJS entry (`.d.cts`) and no UMD / minified CDN `<script>` bundle.

### d) `onUploadProgress` no longer supported

`fetch` cannot emit upload progress, so `onUploadProgress` was dropped. `onDownloadProgress` still works.

```javascript
// Before
faxios.post('/upload', body, {
  onUploadProgress: e => console.log(e.loaded),   // no longer called
  onDownloadProgress: e => console.log(e.loaded), // still works
});

// Now — remove onUploadProgress; track upload progress at the app layer if needed.
faxios.post('/upload', body, {
  onDownloadProgress: e => console.log(e.loaded),
});
```

### e) Removed config fields

The following config fields were removed from the public type. Passing them is now a **type error** and they are **ignored at runtime**:

`maxRedirects`, `maxRate`, `beforeRedirect`, `socketPath`, `allowedSocketPaths`, `transport`, `httpAgent`, `httpsAgent`, `proxy`, `decompress`, `insecureHTTPParser`, `httpVersion`, `http2Options`, `sensitiveHeaders`, `lookup`, `family`.

`maxContentLength` and `maxBodyLength` are **kept** and enforced by the fetch adapter.

### f) Connection / transport errors now surface as `ERR_NETWORK`

A refused connection or other transport failure now rejects with `FaxiosError` code `ERR_NETWORK`, and the underlying OS error (e.g. `ECONNREFUSED`) is attached on `error.cause`. Previously the http adapter surfaced `ECONNREFUSED` as the error code itself.

```javascript
// Before
catch (err) {
  if (err.code === 'ECONNREFUSED') { /* ... */ }
}

// Now
catch (err) {
  if (err.code === 'ERR_NETWORK') {
    const os = err.cause;            // e.g. Error with code 'ECONNREFUSED'
  }
}
```

### g) HTTP/2 and rate limiting removed

`http2Options` (HTTP/2) and `maxRate` (download/upload throttling) are gone. The `fetch` runtime negotiates the HTTP version; throttle at the application or runtime layer if needed.

### Proxy support

faxios no longer manages proxies (`proxy`, `proxy-from-env`, `https-proxy-agent` were removed). Configure proxying at the `fetch` runtime level instead:

- **Node (undici):** set a custom dispatcher/agent via `fetchOptions` (e.g. an undici `ProxyAgent`), or rely on runtime-level proxy environment variables that your `fetch` implementation honors.
- **Browser / Deno / Bun:** use the platform's own proxy configuration.

```javascript
// Node example: proxy via an undici dispatcher passed through fetchOptions
import { ProxyAgent } from 'undici';

faxios.get('https://api.example.com', {
  fetchOptions: { dispatcher: new ProxyAgent('http://proxy.local:8080') },
});
```

### h) Interceptors replaced by `.use()` middleware

`faxios.interceptors` is gone. Register middleware with `.use()`: code before `await next(ctx)` changes the request through `ctx.config`, code after it sees the response, and a `try`/`catch` around `next` replaces an `onRejected` handler. Request interceptors ran last-registered-first while middleware runs in registration order, so check the order when you convert several. `use()` returns the instance, typed with any plugin's request options: keep and use the chained result. Instances made with `create()` start with no middleware. Passing `transitional.legacyInterceptorReqResOrdering` now rejects with `ERR_BAD_OPTION`.

```javascript
// Before
faxios.interceptors.request.use(config => {
  config.headers.set('Authorization', `Bearer ${getToken()}`);
  return config;
});

// Now
const api = faxios.create().use(async (ctx, next) => {
  ctx.config.headers.set('Authorization', `Bearer ${getToken()}`);
  return next(ctx);
});
```

See [Middleware](https://adrianbrowning.github.io/faxios/pages/advanced/middleware) and [Migrating from interceptors](https://adrianbrowning.github.io/faxios/pages/advanced/migrating-from-interceptors) for response interceptors, error handlers, `runWhen`, `eject` and ordering. The patterns below use middleware.

### i) Request `headers` are strictly typed

Request-config `headers` takes strings, numbers, booleans, `null` and `undefined`. Objects and functions are type errors, so convert other values first: `{ "X-Request-Id": String(id) }`. See [Headers](https://adrianbrowning.github.io/faxios/pages/advanced/headers#header-typing).

---

## Overview

faxios 1.x introduced several breaking changes to improve consistency, security, and developer experience. While these changes provide better error handling and more predictable behavior, they require code updates when migrating from 0.x versions.

### Key Changes Summary

| Area | 0.x Behavior | 1.x Behavior | Impact |
|------|--------------|--------------|--------|
| Error Handling | Selective throwing | Consistent throwing | High |
| JSON Parsing | Lenient | Strict | Medium |
| Browser Support | IE11+ | Modern browsers | Low-Medium |
| TypeScript | Partial | Full support | Low |

### Migration Complexity

- **Simple applications**: 1-2 hours
- **Medium applications**: 1-2 days  
- **Large applications with complex error handling**: 3-5 days

## Breaking Changes

### 1. Error Handling Changes

**The most significant change in faxios 1.x is how errors are handled.**

#### 0.x Behavior
```javascript
// faxios 0.x - Some HTTP error codes didn't throw
faxios.get('/api/data')
  .then(response => {
    // Response interceptor could handle all errors
    console.log('Success:', response.data);
  });

// Response interceptor handled everything
faxios.interceptors.response.use(
  response => response,
  error => {
    handleError(error);
    // Error was "handled" and didn't propagate
  }
);
```

#### 1.x Behavior
```javascript
// faxios 1.x - All HTTP errors throw consistently
faxios.get('/api/data')
  .then(response => {
    console.log('Success:', response.data);
  })
  .catch(error => {
    // Must handle errors at call site or they propagate
    console.error('Request failed:', error);
  });

// Error-handling middleware must rethrow, or the caller gets whatever it returns
const api = faxios.create().use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (error) {
    handleError(error);
    throw error; // Must explicitly handle propagation
  }
});
```

#### Impact
- **Error handlers** (now middleware) must rethrow the error or return a response; nothing is "swallowed" by accident
- **Every API call** must handle errors explicitly or they become unhandled promise rejections
- **Centralized error handling** requires new patterns

### 2. JSON Parsing Changes

#### 0.x Behavior
```javascript
// faxios 0.x - Lenient JSON parsing
// Would attempt to parse even invalid JSON
response.data; // Might contain partial data or fallbacks
```

#### 1.x Behavior
```javascript
// faxios 1.x - Strict JSON parsing
// Throws clear errors for invalid JSON
try {
  const data = response.data;
} catch (error) {
  // Handle JSON parsing errors explicitly
}
```

### 3. Request/Response Transform Changes

#### 0.x Behavior
```javascript
// Implicit transformations with some edge cases
transformRequest: [function (data) {
  // Less predictable behavior
  return data;
}]
```

#### 1.x Behavior
```javascript
// More consistent transformation pipeline
transformRequest: [function (data, headers) {
  // Headers parameter always available
  // More predictable behavior
  return data;
}]
```

### 4. Browser Support Changes

- **0.x**: Supported IE11 and older browsers
- **1.x**: Requires modern browsers with Promise support
- **Polyfills**: May be needed for older browser support

## Error Handling Migration

The error handling changes are the most complex part of migrating to faxios 1.x. Here are proven strategies:

### Strategy 1: Centralized Error Handling with Error Boundary

```javascript
// Create a centralized error handler
class ApiErrorHandler {
  constructor() {
    this.api = faxios.create().use(async (ctx, next) => {
      try {
        return await next(ctx);
      } catch (error) {
        // Centralized error processing
        this.processError(error);

        // Resolve with error info for handled errors. Middleware must resolve to a
        // response, so keep the response fields and add the extra ones.
        if (this.isHandledError(error)) {
          return {
            ...error.response,
            data: null,
            error: this.normalizeError(error),
            handled: true
          };
        }

        // Re-throw unhandled errors
        throw error;
      }
    });
  }

  processError(error) {
    // Log errors
    console.error('API Error:', error);
    
    // Show user notifications
    if (error.response?.status === 401) {
      this.handleAuthError();
    } else if (error.response?.status >= 500) {
      this.showErrorNotification('Server error occurred');
    }
  }

  isHandledError(error) {
    // Define which errors are "handled" centrally
    const handledStatuses = [401, 403, 404, 422, 500, 502, 503];
    return handledStatuses.includes(error.response?.status);
  }

  normalizeError(error) {
    return {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      code: error.response?.data?.code || error.code
    };
  }

  handleAuthError() {
    // Redirect to login, clear tokens, etc.
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  showErrorNotification(message) {
    // Show user-friendly error message
    console.error(message); // Replace with your notification system
  }
}

// Initialize globally
const errorHandler = new ApiErrorHandler();

// Usage in components/services
async function fetchUserData(userId) {
  try {
    const response = await errorHandler.api.get(`/api/users/${userId}`);
    
    // Check if error was handled centrally
    if (response.handled) {
      return { data: null, error: response.error };
    }
    
    return { data: response.data, error: null };
  } catch (error) {
    // Unhandled errors still need local handling
    return { data: null, error: { message: 'Unexpected error occurred' } };
  }
}
```

### Strategy 2: Wrapper Function Pattern

```javascript
// Create a wrapper that provides 0.x-like behavior
function createApiWrapper() {
  // Add middleware for centralized handling
  const api = faxios.create().use(async (ctx, next) => {
    try {
      return await next(ctx);
    } catch (error) {
      // Handle common errors centrally
      if (error.response?.status === 401) {
        // Handle auth errors
        handleAuthError();
      }

      if (error.response?.status >= 500) {
        // Handle server errors
        showServerErrorNotification();
      }

      // Always rethrow to maintain error propagation
      throw error;
    }
  });

  // Wrapper function that mimics 0.x behavior
  function safeRequest(requestConfig, options = {}) {
    return api(requestConfig)
      .then(response => response)
      .catch(error => {
        if (options.suppressErrors) {
          // Return error info instead of throwing
          return {
            data: null,
            error: {
              status: error.response?.status,
              message: error.response?.data?.message || error.message
            }
          };
        }
        throw error;
      });
  }

  return { safeRequest, faxios: api };
}

// Usage
const { safeRequest } = createApiWrapper();

// For calls where you want centralized error handling
const result = await safeRequest(
  { method: 'get', url: '/api/data' },
  { suppressErrors: true }
);

if (result.error) {
  // Handle error case
  console.log('Request failed:', result.error.message);
} else {
  // Handle success case
  console.log('Data:', result.data);
}
```

### Strategy 3: Global Error Handler with Custom Events

```javascript
// Set up global error handling with events
class GlobalErrorHandler extends EventTarget {
  constructor() {
    super();
    this.api = faxios.create().use(async (ctx, next) => {
      try {
        return await next(ctx);
      } catch (error) {
        // Emit custom event for global handling
        this.dispatchEvent(new CustomEvent('apiError', {
          detail: { error, timestamp: new Date() }
        }));

        // Always rethrow to maintain proper error flow
        throw error;
      }
    });
  }
}

const globalErrorHandler = new GlobalErrorHandler();

// Set up global listeners
globalErrorHandler.addEventListener('apiError', (event) => {
  const { error } = event.detail;
  
  // Centralized error logic
  if (error.response?.status === 401) {
    handleAuthError();
  }
  
  if (error.response?.status >= 500) {
    showErrorNotification('Server error occurred');
  }
});

// Usage remains clean
async function apiCall() {
  try {
    const response = await globalErrorHandler.api.get('/api/data');
    return response.data;
  } catch (error) {
    // Error was already handled globally
    // Just handle component-specific logic
    return null;
  }
}
```

## API Changes

### Request Configuration

#### 0.x to 1.x Changes
```javascript
// 0.x - Some properties had different defaults
const config = {
  timeout: 0, // No timeout by default
  maxContentLength: -1, // No limit
};

// 1.x - More secure defaults
const config = {
  timeout: 0, // Still no timeout, but easier to configure
  maxContentLength: 2000, // Default limit for security
  maxBodyLength: 2000, // New property
};
```

### Response Object

The response object structure remains largely the same, but error responses are more consistent:

```javascript
// Both 0.x and 1.x
response = {
  data: {}, // Response body
  status: 200, // HTTP status
  statusText: 'OK', // HTTP status message  
  headers: {}, // Response headers
  config: {}, // Request config
  request: {} // Request object
};

// Error responses are more consistent in 1.x
error.response = {
  data: {}, // Error response body
  status: 404, // HTTP error status
  statusText: 'Not Found',
  headers: {},
  config: {},
  request: {}
};
```

## Configuration Changes

### Default Configuration Updates

```javascript
// 0.x defaults
faxios.defaults.timeout = 0; // No timeout
faxios.defaults.maxContentLength = -1; // No limit

// 1.x defaults (more secure)
faxios.defaults.timeout = 0; // Still no timeout
faxios.defaults.maxContentLength = 2000; // 2MB limit
faxios.defaults.maxBodyLength = 2000; // 2MB limit
```

### Instance Configuration

```javascript
// 0.x - Instance creation
const api = faxios.create({
  baseURL: 'https://api.example.com',
  timeout: 1000,
});

// 1.x - Same API, but more options available
const api = faxios.create({
  baseURL: 'https://api.example.com',
  timeout: 1000,
  maxBodyLength: Infinity, // Override default if needed
  maxContentLength: Infinity,
});
```

## Migration Strategies

### Step-by-Step Migration Process

#### Phase 1: Preparation
1. **Audit Current Error Handling**
   ```bash
   # Find all faxios usage
   grep -r "faxios\." src/
   grep -r "\.catch" src/
   grep -r "interceptors" src/
   ```

2. **Identify Patterns**
   - Response interceptors that handle errors
   - Components that rely on centralized error handling
   - Authentication and retry logic

3. **Create Test Cases**
   ```javascript
   // Test current error handling behavior
   describe('Error Handling Migration', () => {
     it('should handle 401 errors consistently', async () => {
       // Test authentication error flows
     });
     
     it('should handle 500 errors with user feedback', async () => {
       // Test server error handling
     });
   });
   ```

#### Phase 2: Implementation
1. **Update Dependencies**
   ```bash
   npm update faxios
   ```

2. **Implement New Error Handling**
   - Choose one of the strategies above
   - Convert response interceptors to middleware
   - Add error handling to API calls

3. **Update Authentication Logic**
   ```javascript
   // 0.x pattern
   faxios.interceptors.response.use(null, error => {
     if (error.response?.status === 401) {
       logout();
       // Error was "handled"
     }
   });

   // Current pattern: middleware
   const api = faxios.create().use(async (ctx, next) => {
     try {
       return await next(ctx);
     } catch (error) {
       if (error.response?.status === 401) {
         logout();
       }
       throw error; // Always propagate
     }
   });
   ```

#### Phase 3: Testing and Validation
1. **Test Error Scenarios**
   - Network failures
   - HTTP error codes (401, 403, 404, 500, etc.)
   - Timeout errors
   - JSON parsing errors

2. **Validate User Experience**
   - Error messages are shown appropriately
   - Authentication redirects work
   - Loading states are handled correctly

### Gradual Migration Approach

For large applications, consider gradual migration:

```javascript
// Create a compatibility layer
const axiosCompat = {
  // Use new faxios instance for new code
  v1: faxios.create({
    // 1.x configuration
  }),
  
  // Wrapper for legacy code
  legacy: createLegacyWrapper(faxios.create({
    // Configuration that mimics 0.x behavior
  }))
};

function createLegacyWrapper(axiosInstance) {
  // Add middleware that provides 0.x-like behavior
  return axiosInstance.use(async (ctx, next) => {
    try {
      return await next(ctx);
    } catch (error) {
      // Handle errors in 0.x style for legacy code
      handleLegacyError(error);
      // Don't propagate certain errors
      if (shouldSuppressError(error)) {
        return { ...error.response, data: null, error: true };
      }
      throw error;
    }
  });
}
```

## Common Patterns

### Authentication Middleware

For a plain bearer token, the built-in `authBearer` plugin (`@gcmdev/faxios/plugins/auth-bearer`) sets the header and only sends it to your API's origin. See [Authentication](https://adrianbrowning.github.io/faxios/pages/advanced/authentication).

#### Token Refresh Pattern
```javascript
// Token refresh middleware: requests that fail with 401 while a refresh is
// running wait for that refresh instead of starting another
let refreshing = null;

const api = faxios.create().use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (error) {
    if (error.response?.status !== 401) throw error;

    refreshing ??= refreshToken().finally(() => {
      refreshing = null;
    });

    let newToken;
    try {
      newToken = await refreshing;
    } catch (refreshError) {
      logout();
      throw refreshError;
    }

    ctx.config.headers.set('Authorization', `Bearer ${newToken}`);
    // Outside the try, so a second 401 goes to the caller instead of looping
    return next(ctx);
  }
});
```

### Retry Logic

```javascript
// The built-in retry plugin: 4 tries, waiting 1s, 2s, 4s between them
import { retry } from '@gcmdev/faxios/plugins/retry';

const api = faxios.create().use(retry({
  attempts: 4,
  delay: attempt => 1000 * 2 ** (attempt - 1),
  jitter: 'none',
}));

// Retried on network errors, timeouts and 408, 429, 500, 502, 503 and 504
await api.get('/api/data');

// Turn retries off for one request
await api.get('/api/report', { retry: false });
```

See [Retry and error recovery](https://adrianbrowning.github.io/faxios/pages/advanced/retry) for the full option list.

### Loading State Management

```javascript
// Loading middleware
class LoadingManager {
  constructor() {
    this.pending = 0;
    this.api = faxios.create().use(async (ctx, next) => {
      this.pending += 1;
      this.updateLoadingState();
      try {
        return await next(ctx);
      } finally {
        this.pending -= 1;
        this.updateLoadingState();
      }
    });
  }
  
  updateLoadingState() {
    const isLoading = this.pending > 0;
    // Update your loading UI
    document.body.classList.toggle('loading', isLoading);
  }
}

const loadingManager = new LoadingManager();
```

## Troubleshooting

### Common Migration Issues

#### Issue 1: Unhandled Promise Rejections

**Problem:**
```javascript
// This pattern worked in 0.x but causes unhandled rejections in 1.x
faxios.get('/api/data'); // No .catch() handler
```

**Solution:**
```javascript
// Always handle promises
faxios.get('/api/data')
  .catch(error => {
    // Handle error appropriately
    console.error('Request failed:', error.message);
  });

// Or use async/await with try/catch
async function fetchData() {
  try {
    const response = await faxios.get('/api/data');
    return response.data;
  } catch (error) {
    console.error('Request failed:', error.message);
    return null;
  }
}
```

#### Issue 2: Error Handlers Not "Handling" Errors

**Problem:**
```javascript
// 0.x style - interceptor "handled" errors
faxios.interceptors.response.use(null, error => {
  showErrorMessage(error.message);
  // Error was considered "handled"
});
```

**Solution:**
```javascript
// Current style - middleware explicitly controls error propagation
const api = faxios.create().use(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (error) {
    showErrorMessage(error.message);

    // Choose whether to propagate the error
    if (shouldPropagateError(error)) {
      throw error;
    }

    // Return a response for "handled" errors
    return {
      ...error.response,
      data: null,
      handled: true,
      error: normalizeError(error)
    };
  }
});
```

#### Issue 3: JSON Parsing Errors

**Problem:**
```javascript
// 1.x is stricter about JSON parsing
// This might throw where 0.x was lenient
const data = response.data;
```

**Solution:**
```javascript
// Add response transformer for better error handling
faxios.defaults.transformResponse = [
  function (data) {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        // Handle JSON parsing errors gracefully
        console.warn('Invalid JSON response:', data);
        return { error: 'Invalid JSON', rawData: data };
      }
    }
    return data;
  }
];
```

#### Issue 4: TypeScript Errors After Upgrade

**Problem:**
```typescript
// TypeScript errors after upgrade
const response = await faxios.get('/api/data');
// Property 'someProperty' does not exist on type 'any'
```

**Solution:**
```typescript
// Define proper interfaces
interface ApiResponse {
  data: any;
  message: string;
  success: boolean;
}

const response = await faxios.get<ApiResponse>('/api/data');
// Now properly typed
console.log(response.data.data);
```

### Debug Migration Issues

#### Enable Debug Logging
```javascript
// Add request/response logging
const api = faxios.create().use(async (ctx, next) => {
  console.log('Request:', ctx.config);
  try {
    const response = await next(ctx);
    console.log('Response:', response);
    return response;
  } catch (error) {
    console.log('Error:', error);
    throw error;
  }
});
```

#### Compare Behavior
```javascript
// Create side-by-side comparison during migration
const axios0x = require('faxios-0x'); // Keep old version for testing
const axios1x = require('faxios');

async function compareRequests(config) {
  try {
    const [result0x, result1x] = await Promise.allSettled([
      axios0x(config),
      axios1x(config)
    ]);
    
    console.log('0.x result:', result0x);
    console.log('1.x result:', result1x);
  } catch (error) {
    console.log('Comparison error:', error);
  }
}
```

## Resources

### Official Documentation
- [faxios documentation](https://adrianbrowning.github.io/faxios/)
- [faxios GitHub Repository](https://github.com/faxios/faxios)
- [faxios Changelog](https://github.com/faxios/faxios/blob/main/CHANGELOG.md)

### Migration Tools
- [faxios Migration Codemod](https://github.com/faxios/faxios-migration-codemod) *(if available)*
- [ESLint Rules for faxios 1.x](https://github.com/faxios/eslint-plugin-faxios) *(if available)*

### Community Resources
- [Stack Overflow - faxios Migration Questions](https://stackoverflow.com/questions/tagged/faxios+migration)
- [GitHub Discussions](https://github.com/faxios/faxios/discussions)
- [faxios Discord Community](https://discord.gg/faxios) *(if available)*

### Related Issues
- [Error Handling Changes Discussion](https://github.com/faxios/faxios/issues/7208)
- [Migration Guide Request](https://github.com/faxios/faxios/issues/xxxx) *(link to related issues)*

---

## Need Help?

If you encounter issues during migration that aren't covered in this guide:

1. **Search existing issues** in the [faxios GitHub repository](https://github.com/faxios/faxios/issues)
2. **Ask questions** in [GitHub Discussions](https://github.com/faxios/faxios/discussions)
3. **Contribute improvements** to this migration guide

---

*This migration guide is maintained by the community. If you find errors or have suggestions, please [open an issue](https://github.com/faxios/faxios/issues) or submit a pull request.*
